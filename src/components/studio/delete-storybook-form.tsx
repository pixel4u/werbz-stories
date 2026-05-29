"use client";

interface DeleteStorybookFormProps {
  id: string;
  action: (formData: FormData) => void | Promise<void>;
}

export function DeleteStorybookForm({ id, action }: DeleteStorybookFormProps) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!confirm("Delete this storybook? This removes all its pages.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" style={{ padding: "0.5rem 0.8rem", cursor: "pointer", color: "#b91c1c" }}>
        Delete
      </button>
    </form>
  );
}
