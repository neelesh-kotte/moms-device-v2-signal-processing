var MOM;
(function (MOM) {
    MOM.SUPABASE_URL = 'https://xzdxqnxsbagbycxmuqmx.supabase.co';
    MOM.SUPABASE_KEY = 'sb_publishable_p4q_l6-cnv7BKBKQzWrutg_K_kPCAGE';
    const ONLINE_WINDOW_MS = 120000;
    const SESSION_LOOKUP_TIMEOUT_MS = 12000;
    const MAX_COMMAND_WAIT_MS = 95000;

    // Validation helpers
    const isValidId = (value) => typeof value === 'string' && value.trim().length > 0;
    const isValidTimestamp = (value) => {
        if (!value) return false;
        const parsed = Date.parse(String(value));
        return Number.isFinite(parsed);
    };
    const isFinite = (value) => typeof value === 'number' && Number.isFinite(value);

    class CloudService {
        constructor() {
            if (!window.supabase)
                throw new Error('Supabase client did not load.');
            if (!window.firebase)
                throw new Error('Firebase Authentication did not load.');

            const firebaseConfig = {
                apiKey: 'AIzaSyD9PqFxbRCXEDhTzHdbqgWD6hDc_IQph7A',
                authDomain: 'momprojec.firebaseapp.com',
                projectId: 'momprojec',
                storageBucket: 'momprojec.firebasestorage.app',
                messagingSenderId: '699393071442',
                appId: '1:699393071442:web:759dc5af973ced136a428b',
                measurementId: 'G-G903DY43SH'
            };

            this.firebaseApp = window.firebase.apps.length
                ? window.firebase.app()
                : window.firebase.initializeApp(firebaseConfig);
            this.firebaseAuth = this.firebaseApp.auth();
            this.firebaseAuth.useDeviceLanguage();

            // Finish a redirect-based Google sign-in if popup fallback was used.
            // Store the promise result to avoid race conditions on page reload.
            this.redirectSignInResult = null;
            this.redirectSignInError = null;
            this.redirectPromiseInitialized = false;

            // Initialize redirect result promise immediately and never re-run it.
            this.firebaseAuth.getRedirectResult().then((result) => {
                this.redirectSignInResult = result;
            }).catch((error) => {
                this.redirectSignInError = error;
                this.redirectSignInResult = null;
            });
            this.redirectPromiseInitialized = true;

            this.client = window.supabase.createClient(MOM.SUPABASE_URL, MOM.SUPABASE_KEY, {
                accessToken: async () => {
                    const user = this.firebaseAuth.currentUser;
                    return user ? user.getIdToken(false) : null;
                },
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false
                }
            });
            MOM.cloud = this;
        }
        normalizeUser(user) {
            if (!user) return null;
            return {
                id: user.uid,
                uid: user.uid,
                email: user.email ?? null,
                displayName: user.displayName ?? null,
                photoURL: user.photoURL ?? null,
                user_metadata: {
                    full_name: user.displayName ?? null,
                    avatar_url: user.photoURL ?? null
                },
                app_metadata: {}
            };
        }
        async getSession() {
            // Wait for redirect result to complete only once.
            if (!this.redirectPromiseInitialized) {
                throw new Error('Firebase authentication is still initializing. Refresh the page.');
            }

            const user = this.firebaseAuth.currentUser;
            
            // Only report redirect error on first call after it occurs.
            if (this.redirectSignInError) {
                const error = this.redirectSignInError;
                this.redirectSignInError = null; // Clear it so it doesn't leak into future sessions
                
                if (error?.code === 'auth/popup-blocked')
                    throw new Error('Your browser blocked Google sign-in. Please allow popups for MOM and try again.');
                if (error?.code === 'auth/unauthorized-domain')
                    throw new Error('MOM is not authorized for Google sign-in on this domain. Add neelesh-kotte.github.io to Firebase Authentication → Settings → Authorized domains.');
                if (error?.code === 'auth/user-disabled')
                    throw new Error('Your Google account has been disabled. Contact support.');
                throw new Error(error?.message || 'Google sign-in could not be completed.');
            }
            
            return user ? { user: this.normalizeUser(user) } : null;
        }
        onAuthChange(callback) {
            let first = true;
            let hadUser = Boolean(this.firebaseAuth.currentUser);
            const unsubscribe = this.firebaseAuth.onIdTokenChanged((user) => {
                let event;
                if (first) {
                    event = 'INITIAL_SESSION';
                } else if (user && !hadUser) {
                    event = 'SIGNED_IN';
                } else if (user) {
                    event = 'TOKEN_REFRESHED';
                } else {
                    event = 'SIGNED_OUT';
                }
                callback(event, user ? { user: this.normalizeUser(user) } : null);
                hadUser = Boolean(user);
                first = false;
            });
            // Return unsubscribe function to allow cleanup.
            return unsubscribe;
        }
        async signInWithGoogle() {
            try {
                const provider = new window.firebase.auth.GoogleAuthProvider();
                provider.setCustomParameters({ prompt: 'select_account' });
                await this.firebaseAuth.signInWithPopup(provider);
                return { error: null };
            } catch (error) {
                if (error?.code === 'auth/popup-closed-by-user')
                    return { error: 'Google sign-in was cancelled.' };
                if (error?.code === 'auth/popup-blocked') {
                    try {
                        const provider = new window.firebase.auth.GoogleAuthProvider();
                        provider.setCustomParameters({ prompt: 'select_account' });
                        await this.firebaseAuth.signInWithRedirect(provider);
                        return { error: null };
                    } catch (redirectError) {
                        return { error: redirectError?.message || 'Google sign-in could not start. Please allow popups for MOM and try again.' };
                    }
                }
                if (error?.code === 'auth/unauthorized-domain')
                    return { error: 'MOM is not authorized for Google sign-in on this domain. Add the GitHub Pages URL to Firebase Authentication → Settings → Authorized domains.' };
                return { error: error?.message || 'Google sign-in failed. Please try again.' };
            }
        }
        async signOut() {
            await this.firebaseAuth.signOut();
        }
        async loadProfiles() {
            const { data, error } = await this.client.from('mom_profiles').select('*').order('created_at');
            if (error) throw new Error(error.message);
            if (!Array.isArray(data)) throw new Error('MOM received an invalid profile list from the cloud.');
            return data;
        }
        async createProfile(ownerId, displayName) {
            const cleanName = String(displayName ?? '').trim().slice(0, 80);
            if (!cleanName) throw new Error('Enter a profile name.');
            const { data, error } = await this.client.from('mom_profiles').insert({ owner_id: ownerId, display_name: cleanName }).select().single();
            if (error) throw new Error(error.message);
            if (!data || !isValidId(data.id)) throw new Error('Profile was created but the response was invalid.');
            return data;
        }
        async deleteProfile(profileId) {
            if (!isValidId(profileId)) throw new Error('Invalid profile ID.');
            const { error } = await this.client.from('mom_profiles').delete().eq('id', profileId);
            if (error) throw new Error(error.message);
        }
        async loadProfileData(profileId) {
            if (!isValidId(profileId)) throw new Error('Invalid profile ID.');
            const [s, c, d, p] = await Promise.all([
                this.client.from('mom_sessions').select('*').eq('profile_id', profileId).order('started_at', { ascending: false }),
                this.client.from('mom_checkins').select('*').eq('profile_id', profileId).order('created_at', { ascending: false }),
                this.client.from('mom_devices').select('*').eq('profile_id', profileId).order('created_at', { ascending: false }),
                this.client.from('mom_preferences').select('*').eq('profile_id', profileId).maybeSingle()
            ]);
            for (const result of [s, c, d, p]) {
                if (result.error) throw new Error(result.error.message);
            }
            // Validate response structure
            if (!Array.isArray(s.data) || !Array.isArray(c.data) || !Array.isArray(d.data)) {
                throw new Error('MOM received an invalid profile data response from the cloud.');
            }
            return { 
                sessions: s.data, 
                checkins: c.data, 
                devices: d.data, 
                preferences: p.data ?? null 
            };
        }
        async saveCheckIn(payload) {
            if (!payload || !isValidId(payload.owner_id) || !isValidId(payload.profile_id)) {
                throw new Error('Invalid check-in data: missing owner or profile.');
            }
            // Validate optional numeric fields
            if (payload.hunger_rating !== null && payload.hunger_rating !== undefined) {
                const rating = Number(payload.hunger_rating);
                if (!isFinite(rating) || rating < 0 || rating > 10) {
                    throw new Error('Hunger rating must be between 0 and 10.');
                }
            }
            if (payload.minutes_since_eating !== null && payload.minutes_since_eating !== undefined) {
                const mins = Number(payload.minutes_since_eating);
                if (!isFinite(mins) || mins < 0 || mins > 525600) { // 365 days in minutes
                    throw new Error('Minutes since eating must be a reasonable value.');
                }
            }
            const { data, error } = await this.client.from('mom_checkins').insert(payload).select().single();
            if (error) throw new Error(error.message);
            if (!data || !isValidId(data.id)) throw new Error('Check-in was saved but the response was invalid.');
            return data;
        }
        async updateCheckIn(id, payload) {
            if (!isValidId(id)) throw new Error('Invalid check-in ID.');
            if (!payload || typeof payload !== 'object') throw new Error('Invalid check-in update payload.');
            const { error } = await this.client.from('mom_checkins').update(payload).eq('id', id);
            if (error) throw new Error(error.message);
        }
        async savePreferences(payload) {
            if (!payload || !isValidId(payload.owner_id) || !isValidId(payload.profile_id)) {
                throw new Error('Invalid preferences: missing owner or profile.');
            }
            if (!Array.isArray(payload.categories)) {
                throw new Error('Preferences categories must be an array.');
            }
            if (!payload.categories.every((x) => typeof x === 'string')) {
                throw new Error('Each category must be a text string.');
            }
            if (!payload.constraints || typeof payload.constraints !== 'object' || Array.isArray(payload.constraints)) {
                throw new Error('Preferences constraints must be an object.');
            }

            try {
                if (payload.id) {
                    // Update existing preferences
                    const { error } = await this.client.from('mom_preferences').update({
                        categories: payload.categories,
                        constraints: payload.constraints,
                        updated_at: new Date().toISOString()
                    }).eq('id', payload.id);
                    if (error) throw new Error(error.message);
                } else {
                    // Insert new preferences
                    const { data, error } = await this.client.from('mom_preferences').insert({
                        owner_id: payload.owner_id,
                        profile_id: payload.profile_id,
                        categories: payload.categories,
                        constraints: payload.constraints
                    }).select().single();
                    if (error) throw new Error(error.message);
                    if (!data || !isValidId(data.id)) throw new Error('Preferences were saved but the response was invalid.');
                }
            } catch (error) {
                throw new Error(`Could not save preferences: ${error?.message || 'unknown error'}`);
            }
        }
        async updateSession(id, payload) {
            if (!isValidId(id)) throw new Error('Invalid session ID.');
            if (!payload || typeof payload !== 'object') throw new Error('Invalid session update payload.');
            const { error } = await this.client.from('mom_sessions').update(payload).eq('id', id);
            if (error) throw new Error(error.message);
        }
        async deleteSession(id) {
            if (!isValidId(id)) throw new Error('Invalid session ID.');
            const { error } = await this.client.from('mom_sessions').delete().eq('id', id);
            if (error) throw new Error(error.message);
        }
        async deletePreferences(profileId) {
            if (!isValidId(profileId)) throw new Error('Invalid profile ID.');
            const { error } = await this.client.from('mom_preferences').delete().eq('profile_id', profileId);
            if (error) throw new Error(error.message);
        }
        isDeviceOnline(device) {
            if (!device || !device.last_seen_at) return false;
            const timestamp = isValidTimestamp(device.last_seen_at) ? Date.parse(String(device.last_seen_at)) : NaN;
            if (!isFinite(timestamp)) return false; // Invalid timestamp cannot be online
            const age = Date.now() - timestamp;
            // Device with future heartbeat is not trusted; it signals a clock issue.
            return age >= 0 && age <= ONLINE_WINDOW_MS;
        }
        deviceCanRecord(device) {
            const capabilities = Array.isArray(device?.capabilities) ? device.capabilities : [];
            return this.isDeviceOnline(device) && capabilities.includes('record_session');
        }
        async getActiveDevice(profileId, ownerId = null) {
            if (!isValidId(profileId)) throw new Error('Invalid profile ID.');
            let query = this.client.from('mom_devices').select('*').eq('profile_id', profileId).order('created_at', { ascending: false }).limit(1);
            if (ownerId) {
                if (!isValidId(ownerId)) throw new Error('Invalid owner ID.');
                query = query.eq('owner_id', ownerId);
            }
            const { data, error } = await query.maybeSingle();
            if (error) throw new Error(error.message);
            return data ?? null;
        }
        async beginDeviceProvisioning(ownerId, profileId) {
            if (!isValidId(ownerId) || !isValidId(profileId)) {
                throw new Error('Invalid owner or profile for device provisioning.');
            }
            let existing = await this.getActiveDevice(profileId, ownerId);
            if (!existing) {
                const { data, error } = await this.client.from('mom_devices').insert({ 
                    owner_id: ownerId, 
                    profile_id: profileId, 
                    display_name: 'MOM Device', 
                    hardware: 'ESP32 + MAX4466' 
                }).select().single();
                if (error) throw new Error(error.message);
                if (!data || !isValidId(data.id)) throw new Error('Device record was created but the response was invalid.');
                existing = data;
            }
            const bytes = new Uint8Array(32);
            crypto.getRandomValues(bytes);
            const token = `mom_${Array.from(bytes).map(x => x.toString(16).padStart(2, '0')).join('')}`;
            const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
            const hash = Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
            const { data: key, error } = await this.client.from('mom_device_keys').insert({ 
                owner_id: ownerId, 
                device_id: existing.id, 
                token_hash: hash, 
                label: 'Browser provisioning' 
            }).select('id').single();
            if (error) throw new Error(error.message);
            if (!key || !isValidId(key.id)) throw new Error('Device key was created but the response was invalid.');
            return { 
                deviceId: existing.id, 
                keyId: key.id, 
                token, 
                endpoint: `${MOM.SUPABASE_URL}/functions/v1/mom-device-ingest` 
            };
        }
        async finalizeDeviceProvisioning(deviceId, keyId) {
            if (!isValidId(deviceId) || !isValidId(keyId)) {
                throw new Error('Invalid device or key ID for finalization.');
            }
            const now = new Date().toISOString();
            const { error } = await this.client.from('mom_device_keys').update({ revoked_at: now }).eq('device_id', deviceId).is('revoked_at', null).neq('id', keyId);
            if (error) throw new Error(error.message);
            return true;
        }
        async abortDeviceProvisioning(keyId) {
            if (!isValidId(keyId)) return false;
            const { error } = await this.client.from('mom_device_keys').update({ revoked_at: new Date().toISOString() }).eq('id', keyId).is('revoked_at', null);
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
            const { data, error } = await this.client.from('mom_device_commands').insert({ 
                owner_id: userId, 
                device_id: device.id, 
                profile_id: profileId, 
                command: 'record_session', 
                payload: { duration_seconds: duration } 
            }).select().single();
            if (error) throw new Error(error.message);
            if (!data || !isValidId(data.id)) throw new Error('Recording command was queued but the response was invalid.');
            return { ...data, device };
        }
        async getRecordingCommand(commandId) {
            if (!isValidId(commandId)) throw new Error('Invalid command ID.');
            const { data, error } = await this.client.from('mom_device_commands').select('id,status,error_message,result_session_id,claimed_at,completed_at').eq('id', commandId).maybeSingle();
            if (error) throw new Error(error.message);
            return data ?? null;
        }
        async waitForCommandClaim(commandId, timeoutMs = 15000) {
            const bounded = Math.max(1000, Math.min(MAX_COMMAND_WAIT_MS, Number(timeoutMs) || 15000));
            const started = Date.now();
            while (Date.now() - started < bounded) {
                const command = await this.getRecordingCommand(commandId);
                if (!command) throw new Error('The recording command could not be found.');
                if (command.status === 'claimed' || command.status === 'completed') return command;
                if (command.status === 'failed') throw new Error(command.error_message || 'The MOM device could not start the recording.');
                await new Promise(resolve => setTimeout(resolve, 800));
            }
            throw new Error('The device is online but did not accept the recording command. Update its firmware from the Device tab, then try again.');
        }
        async waitForCommandCompletion(commandId, timeoutMs = 95000) {
            const bounded = Math.max(1000, Math.min(MAX_COMMAND_WAIT_MS, Number(timeoutMs) || 95000));
            const started = Date.now();
            while (Date.now() - started < bounded) {
                const command = await this.getRecordingCommand(commandId);
                if (!command) throw new Error('The recording command could not be found.');
                if (command.status === 'completed' && command.result_session_id) return command;
                if (command.status === 'failed') throw new Error(command.error_message || 'The MOM device reported a recording failure.');
                await new Promise(resolve => setTimeout(resolve, 1200));
            }
            throw new Error('The recording finished, but MOM could not confirm the upload. Keep the device powered on and check its Wi-Fi connection.');
        }
        async getSessionForCommand(commandId, timeoutMs = SESSION_LOOKUP_TIMEOUT_MS) {
            if (!isValidId(commandId)) throw new Error('Invalid command ID.');
            const bounded = Math.max(1000, Math.min(30000, Number(timeoutMs) || SESSION_LOOKUP_TIMEOUT_MS));
            
            // Implement timeout using Promise.race
            let timeoutId;
            const timeoutPromise = new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error('The device reported completion, but MOM could not find the uploaded session within 12 seconds. Keep the device powered on and retry the upload check.'));
                }, bounded);
            });
            
            try {
                const queryPromise = this.client.from('mom_sessions').select('*').eq('command_id', commandId).maybeSingle();
                const result = await Promise.race([queryPromise, timeoutPromise]);
                if (result.error) throw new Error(result.error.message);
                return result.data ?? null;
            } finally {
                clearTimeout(timeoutId);
            }
        }
    }
    MOM.CloudService = CloudService;
})(MOM || (MOM = {}));
