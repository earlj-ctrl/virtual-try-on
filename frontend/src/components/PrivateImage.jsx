import { useEffect, useState } from "react";
import { api, BACKEND_URL } from "@/lib/api";

/**
 * Renders a private file (photo or try-on render) by fetching it via the
 * ownership-enforced backend endpoint and creating an object URL.
 */
export default function PrivateImage({ fileId, alt = "", className = "", style }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!fileId) return;
    let objUrl;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get(`/files/${fileId}`, { responseType: "blob" });
        if (cancelled) return;
        objUrl = URL.createObjectURL(r.data);
        setSrc(objUrl);
      } catch {
        setSrc(null);
      }
    })();
    return () => {
      cancelled = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [fileId]);

  if (!fileId) return <div className={`bg-muted ${className}`} style={style} />;
  if (!src) {
    return (
      <div className={`bg-muted animate-pulse ${className}`} style={style} data-testid={`file-loading-${fileId}`} />
    );
  }
  return <img src={src} alt={alt} className={className} style={style} data-testid={`file-${fileId}`} />;
}
