/**
 * Runs before first paint so the correct theme is applied without a flash.
 * Static string: it never includes user input. Mirrors the persisted shape of stores/ui-store.ts.
 */
export const THEME_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem("hanabrew-ui")||"null");var st=(s&&s.state)||{};var t=st.theme;if(t!=="sakura-latte"&&t!=="midnight-blossom"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"midnight-blossom":"sakura-latte"}var d=document.documentElement;d.dataset.theme=t;if(st.motion==="reduced"){d.dataset.motion="reduced"}}catch(e){}})();`;
