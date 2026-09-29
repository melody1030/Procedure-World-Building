import { useEffect, useState, type MouseEvent } from "react";

/**
 * A tiny path router: `/` is the homepage and `/<weekId>` (e.g. `/week02`) is a week. It uses the
 * browser history directly, so back/forward work and links can be shared. Firebase Hosting's
 * rewrite (firebase.json) serves index.html for every path, so deep links load on the live site.
 */
const listeners = new Set<() => void>();

function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, "") || "/";
}

export function navigate(path: string) {
  if (path === currentPath()) return;
  window.history.pushState(null, "", path);
  window.scrollTo(0, 0);
  listeners.forEach((listener) => listener());
}

export function usePath(): string {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const update = () => setPath(currentPath());
    listeners.add(update);
    window.addEventListener("popstate", update);
    return () => {
      listeners.delete(update);
      window.removeEventListener("popstate", update);
    };
  }, []);

  return path;
}

/** Link that navigates in-app on a plain click but still behaves like a link (new tab, copy URL). */
export function linkProps(path: string) {
  return {
    href: path,
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      navigate(path);
    },
  };
}
