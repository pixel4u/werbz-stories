"use client";

interface DeletePageFormProps {
  storybookId: string;
  pageId: string;
  action: (formData: FormData) => void | Promise<void>;
}

export function DeletePageForm({ storybookId, pageId, action }: DeletePageFormProps) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!confirm("Delete this page?")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="storybookId" value={storybookId} />
      <input type="hidden" name="pageId" value={pageId} />
      <button type="submit" style={{ padding: "0.5rem 0.8rem", cursor: "pointer" }}>
        Delete
      </button>
    </form>
  );
}
