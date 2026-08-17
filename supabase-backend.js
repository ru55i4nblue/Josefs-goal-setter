/* ============================================================
   Goal Setter — Supabase cloud sync backend
   ------------------------------------------------------------
   Provides window.GoalCloud, a thin layer over supabase-js that:
     - authenticates the user (email + password)
     - stores the whole app state as one JSON row per user
       (table: public.user_state — see supabase/schema.sql)
     - pushes changes (debounced) and receives realtime updates
       from other devices

   It composes the local cache (GoalStore.localBackend) so the UI
   stays instant and works offline; the cloud is the sync layer.

   Inert unless window.SUPABASE_ENABLED is true (keys filled in
   supabase-config.js). The renderer drives it from setupSync().
   ============================================================ */
(function () {
  const cfg = window.SUPABASE_CONFIG || {};
  let client = null;
  let session = null;
  let userId = null;
  let lastPushedAt = null;
  let lastPushedRev = null;         // revision id stamped into our last write, to ignore its echo
  let pushTimer = null;
  const authCbs = [];

  // Sync used to fail completely silently: the upsert's error was discarded, so
  // was pull's, and the realtime channel's status was never looked at. A dropped
  // channel stopped sync until the app was restarted, with nothing said. These
  // three carry what happened so the UI can show it.
  let lastError = null;
  let lastSyncedAt = null;          // last confirmed round-trip, either direction
  let channelState = 'idle';        // idle | joining | live | retrying | off
  const statusCbs = [];

  function status() {
    return { signedIn: !!userId, channel: channelState, lastSyncedAt, lastError };
  }
  function onStatus(cb) { statusCbs.push(cb); }
  function emitStatus() { statusCbs.forEach((cb) => { try { cb(status()); } catch (e) { /* a bad listener must not break sync */ } }); }
  function noteOk() { lastError = null; lastSyncedAt = new Date().toISOString(); emitStatus(); }
  function noteError(e) { lastError = String((e && e.message) || e); emitStatus(); }

  function available() {
    return !!(window.SUPABASE_ENABLED && window.supabase && cfg.url && cfg.anonKey);
  }

  async function init() {
    if (!available()) return null;
    client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
    const { data } = await client.auth.getSession();
    session = data.session;
    userId = session && session.user ? session.user.id : null;
    client.auth.onAuthStateChange((_event, s) => {
      session = s;
      userId = s && s.user ? s.user.id : null;
      authCbs.forEach((cb) => cb(s));
    });
    return session;
  }

  function onAuth(cb) { authCbs.push(cb); }
  function getSession() { return session; }
  function userEmail() { return session && session.user ? session.user.email : null; }

  async function signIn(email, password) {
    const { error } = await client.auth.signInWithPassword({ email, password });
    return { error };
  }
  async function signUp(email, password) {
    const { error } = await client.auth.signUp({ email, password });
    return { error };
  }
  async function signOut() { await client.auth.signOut(); }

  async function pull() {
    if (!userId) return null;
    const { data, error } = await client
      .from('user_state').select('data').eq('user_id', userId).maybeSingle();
    // no row yet is a legitimate answer for a new account; an error is not, and
    // returning null for both is what made a broken pull indistinguishable from
    // a fresh one
    if (error) { noteError(error); return null; }
    noteOk();
    return data ? data.data : null;
  }

  function push(obj) {
    if (!userId) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      lastPushedAt = new Date().toISOString();
      // stamp a revision id into the payload; jsonb reorders keys so comparing
      // serialized JSON is unreliable — an id survives the round-trip intact
      lastPushedRev = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const payload = Object.assign({}, obj, { __rev: lastPushedRev });
      try {
        const { error } = await client.from('user_state').upsert({
          user_id: userId, data: payload, updated_at: lastPushedAt
        });
        if (error) noteError(error); else noteOk();
      } catch (e) { noteError(e); }
    }, 700);
  }

  // A websocket is not a guarantee. Laptops sleep, wifi changes, the server
  // recycles connections — and when the channel died there was nothing watching,
  // so sync just stopped until the app was restarted. Watch the status and
  // rebuild the channel, backing off so a genuinely offline machine doesn't spin.
  function subscribe(handler) {
    if (!userId) return () => {};
    let ch = null;
    let stopped = false;
    let attempt = 0;
    let retryTimer = null;

    const drop = () => { if (ch) { try { client.removeChannel(ch); } catch (e) { /* already gone */ } ch = null; } };
    const retry = () => {
      if (stopped) return;
      clearTimeout(retryTimer);
      channelState = 'retrying'; emitStatus();
      const delay = Math.min(30000, 1000 * Math.pow(2, attempt++));
      retryTimer = setTimeout(() => { if (stopped) return; drop(); connect(); }, delay);
    };

    function connect() {
      if (stopped) return;
      channelState = 'joining'; emitStatus();
      ch = client
        .channel('user_state_' + userId)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'user_state', filter: 'user_id=eq.' + userId },
          async () => {
            // Our row changed (likely on another device). The realtime payload may
            // not carry the full row (depends on REPLICA IDENTITY), so re-fetch it.
            const { data, error } = await client
              .from('user_state').select('data').eq('user_id', userId).maybeSingle();
            if (error) { noteError(error); return; }
            if (!data || !data.data) return;
            noteOk();
            // ignore the echo of our own write via the revision id we stamped
            if (data.data.__rev && data.data.__rev === lastPushedRev) return;
            handler(data.data);
          })
        .subscribe((st, err) => {
          if (stopped) return;
          if (st === 'SUBSCRIBED') {
            attempt = 0; channelState = 'live'; lastError = null; emitStatus();
            return;
          }
          if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') {
            if (err) lastError = String(err.message || err);
            retry();
          }
        });
    }

    connect();
    return () => { stopped = true; clearTimeout(retryTimer); channelState = 'off'; drop(); emitStatus(); };
  }

  // GoalStore-compatible backend: local cache for speed + cloud for sync.
  function backend() {
    const local = window.GoalStore.localBackend;
    return {
      name: 'cloud',
      read() { return local.read(); },         // instant boot from cache
      // Always cache locally; push to cloud unless we're applying a change that
      // just came FROM the cloud (prevents an echo -> save -> push feedback loop).
      write(obj) { local.write(obj); if (!window.__goalApplyingRemote) push(obj); },
      subscribe
    };
  }

  window.GoalCloud = {
    available, init, onAuth, getSession, userEmail,
    signIn, signUp, signOut, pull, push, subscribe, backend,
    status, onStatus
  };
})();
