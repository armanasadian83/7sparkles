export type ThemePreference = "light" | "dark";

export const THEME_STORAGE_KEY = "seven-sparkles-theme";

// Runs synchronously in <head>, before any themed content can paint. Keep the
// root layout static: this preference belongs to the browser, not a server cookie.
export const THEME_BOOTSTRAP = `(function(){var t='light';try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');if(s==='light'||s==='dark')t=s}catch(e){}document.documentElement.dataset.theme=t})()`;
