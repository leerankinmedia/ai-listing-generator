-- Allow full-resolution phone photos (often 10–25MB) for listing/eBay originals.
-- Analysis still uses separate temporary compressed copies under Vercel limits.
update storage.buckets
set
  file_size_limit = 52428800,
  allowed_mime_types = array[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif'
  ]
where id = 'listing-images';
