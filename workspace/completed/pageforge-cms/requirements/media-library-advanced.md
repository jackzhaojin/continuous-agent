# Advanced Media Library

## Overview

Expand the basic media library into a full digital asset management (DAM) system with folder organization, tagging, search, image transformations, and a rich upload experience.

## Folder Organization

### Database Table

```sql
CREATE TABLE media_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES media_folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(site_id, parent_id, slug)
);

CREATE INDEX idx_media_folders_parent ON media_folders(parent_id);
CREATE INDEX idx_media_folders_site ON media_folders(site_id);
```

### Updates to media table

```sql
ALTER TABLE media ADD COLUMN folder_id UUID REFERENCES media_folders(id) ON DELETE SET NULL;
ALTER TABLE media ADD COLUMN tags TEXT[] DEFAULT '{}';
ALTER TABLE media ADD COLUMN alt_text TEXT;
ALTER TABLE media ADD COLUMN title TEXT;
ALTER TABLE media ADD COLUMN description TEXT;

CREATE INDEX idx_media_folder ON media(folder_id);
CREATE INDEX idx_media_tags ON media USING GIN(tags);
```

### Folder UI

- Tree sidebar on the left side of the media library page
- Root level shows "All Media" + top-level folders
- Click a folder to see its contents + subfolders
- Breadcrumb navigation at the top: All Media > Marketing > Banners
- Right-click context menu on folders: Rename, Delete, Move, New Subfolder
- Drag media items onto folders to move them
- Maximum nesting depth: 5 levels

## Tagging System

### Tag Management

- Tags are free-form text strings stored as a Postgres array (`TEXT[]`)
- When uploading or editing media, users can add/remove tags via a tag input component
- Tag input: type-ahead with suggestions from existing tags in the site
- Popular tags shown as quick-add pills below the input

### Tag Queries

```sql
-- Find media with specific tag
SELECT * FROM media WHERE 'banner' = ANY(tags) AND site_id = $1;

-- Find all unique tags for a site
SELECT DISTINCT unnest(tags) AS tag FROM media WHERE site_id = $1 ORDER BY tag;

-- Find media with multiple tags (AND)
SELECT * FROM media WHERE tags @> ARRAY['banner', 'hero'] AND site_id = $1;
```

## Search

### Search Interface

Add a search bar at the top of the media library:

- Real-time search as you type (debounced 300ms)
- Searches across: filename, original_name, title, alt_text, description, tags
- Full-text search using Postgres `tsvector`:

```sql
ALTER TABLE media ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce(alt_text, '') || ' ' ||
      coalesce(description, '') || ' ' ||
      coalesce(original_name, '') || ' ' ||
      coalesce(filename, '') || ' ' ||
      coalesce(array_to_string(tags, ' '), '')
    )
  ) STORED;

CREATE INDEX idx_media_search ON media USING GIN(search_vector);
```

### Filter Options

In addition to text search, provide filter controls:

| Filter | Type | Options |
|--------|------|---------|
| File type | Dropdown | All, Images, Videos, Documents |
| Date | Date range | Last 24h, Last 7 days, Last 30 days, Custom range |
| Uploaded by | Dropdown | All users, specific user |
| Tags | Multi-select | All tags in the site |
| Size | Range | Min/Max file size |

## Upload Experience

### Drag-and-Drop Upload

- The entire media library page is a drop zone
- When files are dragged over, show a full-page overlay: "Drop files to upload"
- Support multiple file upload (up to 20 files at once)
- Show upload progress for each file (progress bar)
- After upload, show a summary: "5 of 5 files uploaded successfully"

### Upload Modal

When clicking the "Upload" button:

1. File picker opens (accept: image/*, video/*, application/pdf)
2. Selected files are previewed in a grid before upload
3. For each file, user can:
   - Set title (defaults to filename)
   - Set alt text
   - Add tags
   - Select target folder
4. "Upload All" button starts the batch upload
5. Progress indicators for each file

### Upload Processing

After upload to Supabase Storage:

1. Generate metadata:
   - For images: extract width/height using a server-side image library or Supabase image transformation
   - For all files: record size, mime type
2. Create the `media` database row
3. Generate renditions (see below)

## Image Renditions

Auto-generate multiple sizes for uploaded images:

| Rendition | Max Width | Purpose |
|-----------|-----------|---------|
| `thumbnail` | 200px | Media library grid view |
| `medium` | 800px | In-page content |
| `large` | 1600px | Full-width heroes |
| `original` | — | Preserved as uploaded |

### Implementation

Use Supabase Storage image transformations (built-in):
```
https://[project].supabase.co/storage/v1/render/image/public/media/[path]?width=200&height=200&resize=contain
```

Store rendition URLs in the media metadata:
```sql
ALTER TABLE media ADD COLUMN renditions JSONB DEFAULT '{}';
```

```json
{
  "thumbnail": "https://...?width=200",
  "medium": "https://...?width=800",
  "large": "https://...?width=1600"
}
```

## Media Detail Panel

When clicking a media item in the library, show a detail side panel:

- Full preview of the image/file
- Editable fields: title, alt text, description, tags, folder
- Read-only info: filename, dimensions, file size, upload date, uploaded by
- Copy URL buttons for each rendition
- "Delete" button (with confirmation)
- "Replace" button — upload a new file, keep the same media ID and all references
- Usage section: "Used on N pages" with links

## Image Picker Modal (for Editor)

When selecting an image for a component prop (e.g., Hero backgroundImage):

1. Modal opens with the full media library interface (search, folders, tags)
2. User can browse or upload new images
3. Clicking an image shows its renditions
4. User selects a rendition (or original) → URL is inserted into the component prop
5. Modal closes, component prop is updated

### Quick Upload

In the image picker modal, include a "Quick Upload" tab:
- Drag-and-drop zone
- Upload → immediately select the new image
- Streamlined flow for adding new images during editing

## RLS Policies

### media_folders
- SELECT: All authenticated users with site access
- INSERT: Any authenticated user with site access
- UPDATE/DELETE: Creator or admin

### media (updated)
- SELECT: All authenticated users (media is shared across a site)
- INSERT: Any authenticated user
- UPDATE: Uploader or admin (for metadata edits)
- DELETE: Uploader or admin
