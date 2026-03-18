import React, { useState, useEffect } from 'react';

interface LinkPreviewProps {
  url: string;
}

interface PreviewData {
  title: string;
  description: string;
  image: string;
  siteName: string;
  domain: string;
}

export function LinkPreview({ url }: LinkPreviewProps) {
  const [data, setData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = localStorage.getItem(`preview_${url}`);
    if (cached) {
      setData(JSON.parse(cached));
      setLoading(false);
      return;
    }

    fetch(`/api/preview?url=${encodeURIComponent(url)}`)
      .then(res => res.json())
      .then(data => {
        setData(data);
        localStorage.setItem(`preview_${url}`, JSON.stringify(data));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [url]);

  if (loading) return (
    <div className="mt-2 max-w-sm border border-stone-200 rounded-xl p-3 animate-pulse">
      <div className="h-32 bg-stone-200 rounded-lg mb-3"></div>
      <div className="h-4 bg-stone-200 rounded w-3/4 mb-2"></div>
      <div className="h-3 bg-stone-200 rounded w-full"></div>
    </div>
  );
  if (!data) return null;

  const isYouTube = url.includes('youtube.com') || url.includes('youtu.be');

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-2 max-w-sm border border-stone-200 rounded-xl overflow-hidden hover:bg-stone-50 transition-colors shadow-sm">
      {data.image && (
        <div className="relative">
          <img src={data.image} alt={data.title} className="w-full h-40 object-cover" referrerPolicy="no-referrer" />
          {isYouTube && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-black/50 p-2 rounded-full">
                <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="p-3">
        <div className="text-xs text-stone-500 font-medium mb-1">{data.siteName || data.domain}</div>
        <div className="font-bold text-sm text-stone-900 mb-1 line-clamp-1">{data.title}</div>
        <div className="text-xs text-stone-600 line-clamp-2">{data.description}</div>
      </div>
    </a>
  );
}
