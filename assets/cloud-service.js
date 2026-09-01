
var MOM;
(function (MOM) {
    MOM.SUPABASE_URL = 'https://xzdxqnxsbagbycxmuqmx.supabase.co';
    MOM.SUPABASE_KEY = 'sb_publishable_p4q_l6-cnv7BKBKQzWrutg_K_kPCAGE';
    class CloudService {
        constructor() {
            if (!window.supabase)
                throw new Error('Supabase client library did not load.');
            this.client = window.supabase.createClient(MOM.SUPABASE_URL, MOM.SUPABASE_KEY, {
                auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
            });
        }
        async googleProviderEnabled() {
            try {
                const r = await fetch(`${MOM.SUPABASE_URL}/auth/v1/settings`, {
                    headers: { apikey: MOM.SUPABASE_KEY },
                    cache: 'no-store'
                });
                if (!r.ok)
                    return false;
                const body = await r.json();
                return Boolean(body?.external?.google);
            }
            catch {
                return false;
            }
        }
        async getSession() {
            const { data } = await this.client.auth.getSession();
            return data?.session ?? null;
        }
        onAuthChange(callback) {
            const { data } = this.client.auth.onAuthStateChange(callback);
            return () => data.subscription.unsubscribe();
        }
        async signInWithGoogle() {
            const enabled = await this.googleProviderEnabled();
            if (!enabled)
                return { error: 'Google sign-in is not enabled in the MOM cloud project yet.' };
            const redirectTo = `${location.origin}${location.pathname}`;
            const { error } = await this.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
            return { error: error?.message ?? null };
        }
        async signOut() { await this.client.auth.signOut(); }
        async loadProfiles() {
            const { data, error } = await this.client.from('mom_profiles').select('*').order('created_at');
            if (error)
                throw new Error(error.message);
            return data ?? [];
        }
        async createProfile(ownerId, displayName) {
            const { data, error } = await this.client.from('mom_profiles').insert({ owner_id: ownerId, display_name: displayName }).select().single();
            if (error)
                throw new Error(error.message);
            return data;
        }
        async deleteProfile(profileId) {
            const { error } = await this.client.from('mom_profiles').delete().eq('id', profileId);
            if (error)
                throw new Error(error.message);
        }
        async loadProfileData(profileId) {
            const [s, c, d, p] = await Promise.all([
                this.client.from('mom_sessions').select('*').eq('profile_id', profileId).order('started_at', { ascending: false }),
                this.client.from('mom_checkins').select('*').eq('profile_id', profileId).order('created_at', { ascending: false }),
                this.client.from('mom_devices').select('*').eq('profile_id', profileId).order('created_at', { ascending: false }),
                this.client.from('mom_preferences').select('*').eq('profile_id', profileId).maybeSingle()
            ]);
            for (const result of [s, c, d, p])
                if (result.error)
                    throw new Error(result.error.message);
            return { sessions: s.data ?? [], checkins: c.data ?? [], devices: d.data ?? [], preferences: p.data ?? null };
        }
        async saveCheckIn(payload) {
            const { data, error } = await this.client.from('mom_checkins').insert(payload).select().single();
            if (error)
                throw new Error(error.message);
            return data;
        }
        async updateCheckIn(id, payload) {
            const { error } = await this.client.from('mom_checkins').update(payload).eq('id', id);
            if (error)
                throw new Error(error.message);
        }
        async savePreferences(payload) {
            if (payload.id) {
                const { error } = await this.client.from('mom_preferences').update({ categories: payload.categories, constraints: payload.constraints, updated_at: new Date().toISOString() }).eq('id', payload.id);
                if (error)
                    throw new Error(error.message);
            }
            else {
                const { error } = await this.client.from('mom_preferences').insert({ owner_id: payload.owner_id, profile_id: payload.profile_id, categories: payload.categories, constraints: payload.constraints });
                if (error)
                    throw new Error(error.message);
            }
        }
        async updateSession(id, payload) {
            const { error } = await this.client.from('mom_sessions').update(payload).eq('id', id);
            if (error)
                throw new Error(error.message);
        }
        async deleteSession(id) {
            const { error } = await this.client.from('mom_sessions').delete().eq('id', id);
            if (error)
                throw new Error(error.message);
        }
        async deletePreferences(profileId) {
            const { error } = await this.client.from('mom_preferences').delete().eq('profile_id', profileId);
            if (error)
                throw new Error(error.message);
        }
        async pairDevice(ownerId, profileId) {
            let { data: existing, error: selectError } = await this.client.from('mom_devices').select('*').eq('profile_id', profileId).limit(1).maybeSingle();
            if (selectError)
                throw new Error(selectError.message);
            if (!existing) {
                const { data, error } = await this.client.from('mom_devices').insert({ owner_id: ownerId, profile_id: profileId, display_name: 'MOM Device', hardware: 'ESP32 + MAX4466' }).select().single();
                if (error)
                    throw new Error(error.message);
                existing = data;
            }
            const bytes = new Uint8Array(32);
            crypto.getRandomValues(bytes);
            const token = `mom_${Array.from(bytes).map(x => x.toString(16).padStart(2, '0')).join('')}`;
            const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
            const hash = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
            const { error } = await this.client.from('mom_device_keys').insert({ owner_id: ownerId, device_id: existing.id, token_hash: hash });
            if (error)
                throw new Error(error.message);
            return { token, endpoint: `${MOM.SUPABASE_URL}/functions/v1/mom-device-ingest` };
        }
    }
    MOM.CloudService = CloudService;
})(MOM || (MOM = {}));


