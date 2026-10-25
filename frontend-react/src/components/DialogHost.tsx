/** Renders dialogs opened with openDialog() (see stores/dialogHost.ts). */
import { Fragment } from "react";
import { useDialogHost } from "@/stores/dialogHost";

export default function DialogHost() {
  const dialogs = useDialogHost((s) => s.dialogs);
  return (
    <>
      {dialogs.map((d) => (
        <Fragment key={d.id}>{d.node}</Fragment>
      ))}
    </>
  );
}
