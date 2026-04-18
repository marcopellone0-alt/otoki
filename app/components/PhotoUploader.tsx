"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { supabase } from "../../lib/supabase";

type Photo = {
  id: string;
  entry_id: string;
  photo_url: string;
  storage_path: string;
  position: number;
  created_at: string;
};

type Props = {
  entryId: string;
  userId: string;
  /** If false, photos render read-only (no upload / delete buttons). */
  canEdit: boolean;
};

const MAX_PHOTOS = 6;
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

/**
 * Resizes an image file client-side before upload.
 * Ensures max dimension is 1600px (preserving aspect ratio) and re-encodes
 * as JPEG at 80% quality. Keeps uploads fast on mobile data.
 */
async function resizeImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas context unavailable"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Canvas toBlob failed"));
          },
          "image/jpeg",
          JPEG_QUALITY
        );
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

export default function PhotoUploader({ entryId, userId, canEdit }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("scrapbook_photos")
        .select("*")
        .eq("entry_id", entryId)
        .order("position", { ascending: true });

      if (error) {
        console.error("[photos] load error:", error);
      }
      if (data) setPhotos(data as Photo[]);
      setLoading(false);
    };
    load();
  }, [entryId]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !canEdit) return;

    setError(null);
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      setError(`Max ${MAX_PHOTOS} photos per entry.`);
      return;
    }

    const toUpload = Array.from(files).slice(0, remaining);
    setUploading(true);

    for (const file of toUpload) {
      try {
        // Resize before upload to cut bandwidth on mobile.
        const resized = await resizeImage(file);

        const timestamp = Date.now();
        const storagePath = `${userId}/${entryId}/${timestamp}-${Math.random()
          .toString(36)
          .slice(2, 8)}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from("scrapbook-photos")
          .upload(storagePath, resized, {
            contentType: "image/jpeg",
            cacheControl: "31536000",
          });

        if (uploadError) {
          console.error("[photos] upload error:", uploadError);
          setError(uploadError.message);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from("scrapbook-photos")
          .getPublicUrl(storagePath);

        const nextPosition =
          photos.length === 0
            ? 0
            : Math.max(...photos.map((p) => p.position)) + 1;

        const { data: inserted, error: insertError } = await supabase
          .from("scrapbook_photos")
          .insert({
            entry_id: entryId,
            photo_url: urlData.publicUrl,
            storage_path: storagePath,
            position: nextPosition,
          })
          .select()
          .single();

        if (insertError) {
          console.error("[photos] DB insert error:", insertError);
          // Roll back the storage upload if the DB insert failed.
          await supabase.storage
            .from("scrapbook-photos")
            .remove([storagePath]);
          setError(insertError.message);
          continue;
        }

        if (inserted) setPhotos((prev) => [...prev, inserted as Photo]);
      } catch (err: any) {
        console.error("[photos] processing error:", err);
        setError(err.message || "Upload failed");
      }
    }

    setUploading(false);
    // Clear the input so the same file can be re-picked if deleted.
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const deletePhoto = async (photo: Photo) => {
    if (!canEdit) return;
    if (!confirm("Delete this photo?")) return;

    // Optimistic remove from UI.
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));

    const { error: dbError } = await supabase
      .from("scrapbook_photos")
      .delete()
      .eq("id", photo.id);

    if (dbError) {
      console.error("[photos] delete row error:", dbError);
      // Re-add on failure so the user sees the real state.
      setPhotos((prev) => [...prev, photo].sort((a, b) => a.position - b.position));
      setError(dbError.message);
      return;
    }

    const { error: storageError } = await supabase.storage
      .from("scrapbook-photos")
      .remove([photo.storage_path]);

    if (storageError) {
      // DB row is gone; orphaned storage object is annoying but not
      // user-facing. Log and move on.
      console.error("[photos] delete storage error:", storageError);
    }
  };

  if (loading) {
    return (
      <div className="mb-6">
        <p className="text-[11px] font-semibold tracking-wider uppercase mb-2" style={{ color: "#A3A3A3" }}>
          Photos
        </p>
        <p className="text-sm" style={{ color: "#525252" }}>Loading…</p>
      </div>
    );
  }

  // Read-only view: just render a horizontal photo row, nothing else.
  if (!canEdit) {
    if (photos.length === 0) return null;
    return (
      <div className="mb-6 -mx-6">
        <div
          className="flex gap-2 overflow-x-auto px-6 pb-2"
          style={{ scrollbarWidth: "none" }}
        >
          {photos.map((photo) => (
            <img
              key={photo.id}
              src={photo.photo_url}
              alt=""
              className="rounded-xl shrink-0"
              style={{
                width: "280px",
                height: "280px",
                objectFit: "cover",
                border: "1px solid #262626",
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  const canAddMore = photos.length < MAX_PHOTOS;

  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between mb-2">
        <p
          className="text-[11px] font-semibold tracking-wider uppercase"
          style={{ color: "#A3A3A3" }}
        >
          Photos
        </p>
        <p className="text-[11px]" style={{ color: "#525252" }}>
          {photos.length} / {MAX_PHOTOS}
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
        disabled={uploading || !canAddMore}
      />

      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <div
            key={photo.id}
            className="relative rounded-lg overflow-hidden"
            style={{
              aspectRatio: "1 / 1",
              backgroundColor: "#171717",
              border: "1px solid #262626",
            }}
          >
            <img
              src={photo.photo_url}
              alt=""
              className="w-full h-full object-cover"
            />
            <button
              onClick={() => deletePhoto(photo)}
              className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center transition-colors"
              style={{
                backgroundColor: "rgba(10, 10, 10, 0.75)",
                color: "#FAFAFA",
              }}
              aria-label="Delete photo"
            >
              <X size={12} />
            </button>
          </div>
        ))}

        {canAddMore && (
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-lg flex flex-col items-center justify-center transition-colors"
            style={{
              aspectRatio: "1 / 1",
              backgroundColor: "#171717",
              border: "1px dashed #262626",
              color: uploading ? "#525252" : "#A3A3A3",
              cursor: uploading ? "not-allowed" : "pointer",
            }}
          >
            <Plus size={20} />
            <span className="text-[10px] font-semibold tracking-wider uppercase mt-1">
              {uploading ? "Adding…" : "Add"}
            </span>
          </button>
        )}
      </div>

      {error && (
        <p
          className="text-[11px] mt-2"
          style={{ color: "#FF0033" }}
        >
          {error}
        </p>
      )}
    </div>
  );
}
