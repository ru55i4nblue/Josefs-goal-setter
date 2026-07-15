/* ============================================================
   Goal Setter — storage abstraction (swappable backend)
   ------------------------------------------------------------
   The renderer only ever talks to window.GoalStore. Today that's
   backed by localStorage; later it can be backed by Supabase
   (cloud + realtime sync) without touching the renderer logic.

   Backend contract:
     name                       -> string id
     read()                     -> parsed state object | null   (may be sync or async)
     write(obj)                 -> persist the state object
     subscribe(handler)         -> call handler(remoteState) when another
                                   device changes the data; returns an
                                   unsubscribe function. (no-op for local)
   ============================================================ */
(function () {
  const STORE_KEY = 'goalSetter.v1';

  const localBackend = {
    name: 'local',
    read() {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    },
    write(obj) {
      localStorage.setItem(STORE_KEY, JSON.stringify(obj));
    },
    subscribe() { return () => {}; } // local storage has no remote changes
  };

  let backend = localBackend;

  window.GoalStore = {
    /** Swap in a different backend (e.g. Supabase) at boot. */
    use(b) { backend = b; },
    get backendName() { return backend.name; },
    read() { return backend.read(); },
    write(obj) { return backend.write(obj); },
    subscribe(handler) { return backend.subscribe(handler); },
    /** Exposed so a cloud backend can keep a fast local cache. */
    localBackend
  };
})();
