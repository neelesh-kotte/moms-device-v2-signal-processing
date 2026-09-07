var MOM;
(function (MOM) {
    MOM.SUPABASE_URL = 'https://xzdxqnxsbagbycxmuqmx.supabase.co';
    MOM.SUPABASE_KEY = 'sb_publishable_p4q_l6-cnv7BKBKQzWrutg_K_kPCAGE';
    const ONLINE_WINDOW_MS = 120000;
    class CloudService {
        constructor() {
            if (!window.supabase)
                throw new Error('Supabase client library did not load.');
            this.client = window.supabase.createClient(MOM.SUPABASE_URL, MOM.SUPABASE_KEY, {
                auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
            });
            MOM.cloud = this;
        }
        async googleProviderEnabled() {
            try {
                const r = await fetch(`${MOM.SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: MOM.SUPABASE_KEY }, cache: 'no-store' });
                if (!r.ok) return false;
                const body = await r.json();
                return Boolean(body?.external?.google);
            } catch { return false; }
        }
        async getSession() {
            const { data, error } = await this.client.auth.getSession();
            if (error) throw new Error(error.message);
            return data?.session ?? null;
        }
        onAuthChange(callback) {
            const { data } = this.client.auth.onAuthStateChange(callback);
            return () => data.subscription.unsubscribe();
        }
        async signInWithGoogle() {
            const enabled = await this.googleProviderEnabled();
            if (!enabled) return { error: 'Google sign-in is not enabled in the MOM cloud project yet.' };
            const redirectTo = `${location.origin}${location.pathname}`;
            const { error } = await this.client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
            return { error: error?.message ?? null };
        }
        async signOut() { await this.client.auth.signOut(); }
        async loadProfiles() {
            const { data, error } = await this.client.from('mom_profiles').select('*').order('created_at');
            if (error) throw new Error(error.message);
            return data ?? [];
        }
        async createProfile(ownerId, displayName) {
            const cleanName = String(displayName ?? '').trim().slice(0, 80);
            if (!cleanName) throw new Error('Enter a profile name.');
            const { data, error } = await this.client.from('mom_profiles').insert({ owner_id: ownerId, display_name: cleanName }).select().single();
            if (error) throw new Error(error.message);
            return data;
        }
        async deleteProfile(profileId) {
            const { error } = await this.client.from('mom_profiles').delete().eq('id', profileId);
            if (error) throw new Error(error.message);
        }
        async loadProfileData(profileId) {
            const [s, c, d, p] = await Promise.all([
                this.client.from('mom_sessions').select('*').eq('profile_id', profileId).order('started_at', { ascending: false }),
                this.client.from('mom_checkins').select('*').eq('profile_id', profileId).order('created_at', { ascending: false }),
                this.client.from('mom_devices').select('*').eq('profile_id', profileId).order('created_at', { ascending: false }),
                this.client.from('mom_preferences').select('*').eq('profile_id', profileId).maybeSingle()
            ]);
            for (const result of [s, c, d, p]) if (result.error) throw new Error(result.error.message);
            return { sessions: s.data ?? [], checkins: c.data ?? [], devices: d.data ?? [], preferences: p.data ?? null };
        }
        async saveCheckIn(payload) {
            const { data, error } = await this.client.from('mom_checkins').insert(payload).select().single();
            if (error) throw new Error(error.message);
            return data;
        }
        async updateCheckIn(id, payload) {
            const { error } = await this.client.from('mom_checkins').update(payload).eq('id', id);
            if (error) throw new Error(error.message);
        }
        async savePreferences(payload) {
            if (payload.id) {
                const { error } = await this.client.from('mom_preferences').update({ categories: payload.categories, constraints: payload.constraints, updated_at: new Date().toISOString() }).eq('id', payload.id);
                if (error) throw new Error(error.message);
            } else {
                const { error } = await this.client.from('mom_preferences').insert({ owner_id: payload.owner_id, profile_id: payload.profile_id, categories: payload.categories, constraints: payload.constraints });
                if (error) throw new Error(error.message);
            }
        }
        async updateSession(id, payload) {
            const { error } = await this.client.from('mom_sessions').update(payload).eq('id', id);
            if (error) throw new Error(error.message);
        }
        async deleteSession(id) {
            const { error } = await this.client.from('mom_sessions').delete().eq('id', id);
            if (error) throw new Error(error.message);
        }
        async deletePreferences(profileId) {
            const { error } = await this.client.from('mom_preferences').delete().eq('profile_id', profileId);
            if (error) throw new Error(error.message);
        }
        isDeviceOnline(device) {
            const lastSeen = device?.last_seen_at ? new Date(device.last_seen_at).getTime() : 0;
            return Boolean(lastSeen && Date.now() - lastSeen <= ONLINE_WINDOW_MS);
        }
        deviceCanRecord(device) {
            const capabilities = Array.isArray(device?.capabilities) ? device.capabilities : [];
            return this.isDeviceOnline(device) && capabilities.includes('record_session');
        }
        async getActiveDevice(profileId, ownerId = null) {
            let query = this.client.from('mom_devices').select('*').eq('profile_id', profileId).order('created_at', { ascending: false }).limit(1);
            if (ownerId) query = query.eq('owner_id', ownerId);
            const { data, error } = await query.maybeSingle();
            if (error) throw new Error(error.message);
            return data ?? null;
        }
        async beginDeviceProvisioning(ownerId, profileId) {
            let existing = await this.getActiveDevice(profileId, ownerId);
            if (!existing) {
                const { data, error } = await this.client.from('mom_devices').insert({ owner_id: ownerId, profile_id: profileId, display_name: 'MOM Device', hardware: 'ESP32 + MAX4466' }).select().single();
                if (error) throw new Error(error.message);
                existing = data;
            }
            const bytes = new Uint8Array(32);
            crypto.getRandomValues(bytes);
            const token = `mom_${Array.from(bytes).map(x => x.toString(16).padStart(2, '0')).join('')}`;
            const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
            const hash = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
            const { data: key, error } = await this.client.from('mom_device_keys').insert({ owner_id: ownerId, device_id: existing.id, token_hash: hash, label: 'Browser provisioning' }).select('id').single();
            if (error) throw new Error(error.message);
            return { deviceId: existing.id, keyId: key.id, token, endpoint: `${MOM.SUPABASE_URL}/functions/v1/mom-device-ingest` };
        }
        async finalizeDeviceProvisioning(deviceId, keyId) {
            const now = new Date().toISOString();
            const { error } = await this.client.from('mom_device_keys').update({ revoked_at: now }).eq('device_id', deviceId).is('revoked_at', null).neq('id', keyId);
            if (error) throw new Error(error.message);
            return true;
        }
        async pairDevice(ownerId, profileId) {
            if (!document.getElementById('mom-device-setup')) throw new Error('Manual device credentials are disabled. Use Connect MOM Device so the credential stays hidden.');
            return this.beginDeviceProvisioning(ownerId, profileId);
        }
        async queueRecording(profileId, durationSeconds = 60) {
            const session = await this.getSession();
            const userId = session?.user?.id;
            if (!userId) throw new Error('Please sign in again before recording.');
            const device = await this.getActiveDevice(profileId, userId);
            if (!device) throw new Error('No MOM device is paired with this profile. Open Device and connect it first.');
            if (!this.isDeviceOnline(device)) throw new Error('Your MOM device is offline. Power it on and wait for Device status to update.');
            if (!this.deviceCanRecord(device)) throw new Error('Your MOM device is online but needs the recording firmware update. Open Device → Update firmware.');
            const duration = Math.max(1, Math.min(600, Math.round(Number(durationSeconds) || 60)));
            const { data, error } = await this.client.from('mom_device_commands').insert({ owner_id: userId, device_id: device.id, profile_id: profileId, command: 'record_session', payload: { duration_seconds: duration }, expires_at: new Date(Date.now() + 30000).toISOString() }).select('id,status,created_at').single();
            if (error) throw new Error(error.message);
            return { ...data, device };
        }
        async getRecordingCommand(commandId) {
            const { data, error } = await this.client.from('mom_device_commands').select('id,status,error_message,result_session_id,claimed_at,completed_at').eq('id', commandId).maybeSingle();
            if (error) throw new Error(error.message);
            return data ?? null;
        }
        async waitForCommandClaim(commandId, timeoutMs = 15000) {
            const started = Date.now();
            while (Date.now() - started < timeoutMs) {
                const command = await this.getRecordingCommand(commandId);
                if (!command) throw new Error('The recording command could not be found.');
                if (command.status === 'claimed' || command.status === 'completed') return command;
                if (command.status === 'failed') throw new Error(command.error_message || 'The MOM device could not start the recording.');
                await new Promise(resolve => setTimeout(resolve, 800));
            }
            throw new Error('The device is online but did not accept the recording command. Update its firmware from the Device tab, then try again.');
        }
        async waitForCommandCompletion(commandId, timeoutMs = 95000) {
            const started = Date.now();
            while (Date.now() - started < timeoutMs) {
                const command = await this.getRecordingCommand(commandId);
                if (!command) throw new Error('The recording command could not be found.');
                if (command.status === 'completed' && command.result_session_id) return command;
                if (command.status === 'failed') throw new Error(command.error_message || 'The MOM device reported a recording failure.');
                await new Promise(resolve => setTimeout(resolve, 1200));
            }
            throw new Error('The recording finished, but MOM could not confirm the upload. Keep the device powered on and check its Wi-Fi connection.');
        }
        async getSessionForCommand(commandId) {
            const { data, error } = await this.client.from('mom_sessions').select('*').eq('command_id', commandId).maybeSingle();
            if (error) throw new Error(error.message);
            return data ?? null;
        }
    }
    MOM.CloudService = CloudService;
})(MOM || (MOM = {}));
