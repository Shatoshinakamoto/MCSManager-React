/** Global single-input prompt driven by useAppTools.openInputDialog (port of InputDialogProvider.vue). */
import { Input, Modal } from "antd";
import { useState } from "react";
import { useAppTools } from "@/stores/appTools";

export default function InputDialogProvider() {
  const { inputDialog, closeInputDialog } = useAppTools();
  const [value, setValue] = useState("");
  const finish = (ok: boolean) => {
    if (ok) inputDialog.resolve?.(value);
    else inputDialog.reject?.(new Error("Dialog closed by user"));
    closeInputDialog();
    setValue("");
  };
  return (
    <Modal open={inputDialog.show} centered title={inputDialog.title} width={400} onOk={() => finish(true)} onCancel={() => finish(false)} destroyOnHidden>
      <div style={{ margin: "20px 0" }}>
        <Input value={value} placeholder={inputDialog.title} onChange={(e) => setValue(e.target.value)} onPressEnter={() => finish(true)} />
      </div>
    </Modal>
  );
}
