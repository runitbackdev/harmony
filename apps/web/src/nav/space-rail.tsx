import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { Button, Dialog } from "@runitback/react";
import { MxAvatar, Rail, TextField } from "@/ui";
import { Home, ImagePlus, Plus, X } from "lucide-react";
import { createSpace, useSpaces } from "@/spaces/api";
import { SyncIndicator } from "./sync-indicator";
import * as v from "valibot";

// #region Schemas

const createSpaceSchema = v.object({
  name: v.pipe(
    v.string(),
    v.minLength(1, "Name is required"),
    v.maxLength(255, "Name is too long"),
  ),
  avatar: v.nullable(v.instance(File)),
});

// #endregion

// #region AvatarPicker

function AvatarPicker({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex size-20 items-center justify-center overflow-hidden rounded-full bg-soft transition-opacity hover:opacity-80"
        aria-label="Choose space avatar"
      >
        {previewUrl ? (
          <img src={previewUrl} alt="" className="size-full object-cover" />
        ) : (
          <ImagePlus size={24} className="text-sub" />
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      {file && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-data text-sub transition-colors hover:text-ink"
        >
          Remove
        </button>
      )}
    </div>
  );
}

// #endregion

async function fileToBytes(file: File): Promise<number[]> {
  const buf = await file.arrayBuffer();
  return Array.from(new Uint8Array(buf));
}

interface SpaceRailProps {
  className?: string;
  onAfterNavigate?: () => void;
}

/**
 * Shared component for the space navigation rail.
 * Does NOT register omnibar commands (those should be hoisted to the route).
 */
export function SpaceRail({ className, onAfterNavigate }: SpaceRailProps) {
  const spacesSub = useSpaces();
  const spaces = spacesSub.value ?? [];
  const navigate = useNavigate();
  const { spaceId } = useParams({ strict: false });
  const [createOpen, setCreateOpen] = useState(false);

  const form = useForm({
    defaultValues: { name: "", avatar: null as File | null },
    validators: { onSubmit: createSpaceSchema },
    onSubmit: async ({ value }) => {
      const avatarBytes = value.avatar ? await fileToBytes(value.avatar) : null;
      const avatarContentType = value.avatar?.type ?? null;
      const result = await createSpace({
        name: value.name,
        avatarBytes,
        avatarContentType,
      });
      if (!result.ok) throw new Error(result.error.message ?? result.error.code);
      setCreateOpen(false);
      form.reset();
    },
  });

  return (
    <>
      <Rail className={className}>
        <Rail.Item label="Home" data-rail="home">
          <Home size={20} />
        </Rail.Item>

        <Rail.Separator />

        {spaces.length > 0 && (
          <>
            {spaces.map((space) => (
              <Rail.Item
                key={space.roomId}
                active={spaceId === space.roomId}
                label={space.displayName}
                data-rail="server"
                data-server={space.roomId}
                onClick={() => {
                  void navigate({
                    to: "/$spaceId",
                    params: { spaceId: space.roomId },
                  });
                  onAfterNavigate?.();
                }}
              >
                <MxAvatar
                  mxc={space.avatarUrl}
                  name={space.displayName}
                  size={96}
                  className="size-full rounded-[inherit]! text-data font-semibold"
                />
              </Rail.Item>
            ))}

            <Rail.Separator />
          </>
        )}

        <Rail.Item label="Create space" data-rail="add-server" onClick={() => setCreateOpen(true)}>
          <Plus size={20} />
        </Rail.Item>

        <div className="mt-auto flex flex-col items-center gap-2" data-rail="footer">
          <Rail.Separator />
          <SyncIndicator className="mb-1" />
        </div>
      </Rail>

      <Dialog.Root open={createOpen} onOpenChange={setCreateOpen}>
        <Dialog.Portal>
          <Dialog.Backdrop />
          <Dialog.Popup>
            <Dialog.Title>Create a Space</Dialog.Title>
            <Dialog.Description>Give your space a name to get started.</Dialog.Description>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void form.handleSubmit();
              }}
              className="mt-4 space-y-4"
            >
              <form.Field name="avatar">
                {(field) => <AvatarPicker file={field.state.value} onChange={field.handleChange} />}
              </form.Field>

              <form.Field name="name">
                {(field) => (
                  <TextField
                    label="Name"
                    type="text"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    error={field.state.meta.errors[0]?.message}
                    autoFocus
                  />
                )}
              </form.Field>

              <Button type="submit" disabled={form.state.isSubmitting} className="w-full">
                {form.state.isSubmitting ? "Creating…" : "Create"}
              </Button>
            </form>

            <Dialog.Close className="absolute top-4 right-4 cursor-pointer text-sub transition-colors hover:text-ink">
              <X size={16} aria-hidden="true" />
              <span className="sr-only">Close</span>
            </Dialog.Close>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
