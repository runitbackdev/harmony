import { useState } from "react";
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { Dialog, Rail, TextField } from "@harmony/ui";
import { Home, Plus, X } from "lucide-react";
import { createSpace, useSpaces } from "@harmony/react";
import * as v from "valibot";

export const Route = createFileRoute("/_authenticated/_chat")({
  component: RouteComponent,
});

const createSpaceSchema = v.object({
  name: v.pipe(
    v.string(),
    v.minLength(1, "Name is required"),
    v.maxLength(255, "Name is too long"),
  ),
});

function RouteComponent() {
  const spaces = useSpaces();
  const navigate = useNavigate();
  const { spaceId } = useParams({ strict: false });
  const [createOpen, setCreateOpen] = useState(false);

  const form = useForm({
    defaultValues: { name: "" },
    validators: { onSubmit: createSpaceSchema },
    onSubmit: async ({ value }) => {
      await createSpace(value.name);
      setCreateOpen(false);
      form.reset();
    },
  });

  return (
    <div className="flex h-screen overflow-hidden">
      <Rail>
        <Rail.Item active label="Home" data-rail="home">
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
                onClick={() =>
                  navigate({
                    to: "/$spaceId",
                    params: { spaceId: space.roomId },
                  })
                }
              >
                <span className="text-xs font-semibold">
                  {space.displayName[0]}
                </span>
              </Rail.Item>
            ))}

            <Rail.Separator />
          </>
        )}

        <Rail.Item
          label="Create space"
          data-rail="add-server"
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={20} />
        </Rail.Item>
      </Rail>

      <Dialog open={createOpen} onOpenChange={(e) => setCreateOpen(e.open)}>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Title>Create a Space</Dialog.Title>
            <Dialog.Description>
              Give your space a name to get started.
            </Dialog.Description>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                e.stopPropagation();
                form.handleSubmit();
              }}
              className="mt-4 space-y-4"
            >
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

              <button
                className="btn preset-filled-primary-500 w-full"
                type="submit"
                disabled={form.state.isSubmitting}
              >
                {form.state.isSubmitting ? "Creating…" : "Create"}
              </button>
            </form>

            <Dialog.CloseTrigger>
              <X size={16} />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog>

      <Outlet />
    </div>
  );
}
