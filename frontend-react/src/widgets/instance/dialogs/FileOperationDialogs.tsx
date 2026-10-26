/**
 * The file manager's small prompts: name input, zip name, unzip options and
 * permissions. Upstream drives all four from one modal with a "mode" switch
 * inside FileManager.vue; here each is its own promise-based dialog.
 * Every dialog resolves undefined on cancel (upstream left the promise pending).
 */
import { Checkbox, Col, Input, Modal, Radio, Row, Space, Spin, Typography } from "antd";
import { useState, type ReactNode } from "react";
import { getCurrentLang, t } from "@/lang/i18n";
import { openDialog } from "@/stores/dialogHost";
import { reportErrorMsg } from "@/tools/validator";
import type { Permission } from "@/types/fileManager";

function useClose<T>(done: (v?: T) => void) {
  const [open, setOpen] = useState(true);
  return {
    open,
    close: (v?: T) => {
      setOpen(false);
      done(v);
    }
  };
}

function Shell({ open, title, width, onOk, onCancel, children }: { open: boolean; title: string; width?: number; onOk: () => void; onCancel: () => void; children: ReactNode }) {
  return (
    <Modal open={open} title={title} width={width} onOk={onOk} onCancel={onCancel} destroyOnHidden>
      {children}
    </Modal>
  );
}

function NameDialog({ title, info, initial, done }: { title: string; info: string; initial: string; done: (v?: string) => void }) {
  const { open, close } = useClose(done);
  const [value, setValue] = useState(initial);
  const ok = () => (value ? close(value) : reportErrorMsg(t("TXT_CODE_4ea93630")));
  return (
    <Shell open={open} title={title} onOk={ok} onCancel={() => close()}>
      <p>{info}</p>
      <Input autoFocus value={value} placeholder={t("TXT_CODE_4ea93630")} onChange={(e) => setValue(e.target.value)} onPressEnter={ok} />
    </Shell>
  );
}

/** Prompt for a file or folder name; resolves undefined when cancelled. */
export function openFileNameDialog(title: string, info: string, initial = ""): Promise<string | undefined> {
  return openDialog<string | undefined>((done) => <NameDialog title={title} info={info} initial={initial} done={done} />);
}

function ZipDialog({ done }: { done: (v?: string) => void }) {
  const { open, close } = useClose(done);
  const [value, setValue] = useState("");
  const ok = () => (value ? close(value) : reportErrorMsg(t("TXT_CODE_4ea93630")));
  return (
    <Shell open={open} title={t("TXT_CODE_f8a15a94")} onOk={ok} onCancel={() => close()}>
      <p>{t("TXT_CODE_366bad15")}</p>
      <Space orientation="vertical" className="w-100">
        <Space.Compact className="w-100">
          <Input autoFocus value={value} placeholder={t("TXT_CODE_366bad15")} onChange={(e) => setValue(e.target.value)} onPressEnter={ok} />
          <Space.Addon>. zip</Space.Addon>
        </Space.Compact>
      </Space>
      <Space orientation="vertical" className="w-100 mt-16">
        <Typography.Text>{t("TXT_CODE_92ebdc7f")}</Typography.Text>
      </Space>
    </Shell>
  );
}

/** Ask for the archive name (without ".zip"). */
export function openZipDialog(): Promise<string | undefined> {
  return openDialog<string | undefined>((done) => <ZipDialog done={done} />);
}

export interface UnzipOptions {
  /** "0" = extract here, "1" = extract into `dir`. */
  mode: "0" | "1";
  dir: string;
  code: string;
}

function UnzipDialog({ done }: { done: (v?: UnzipOptions) => void }) {
  const { open, close } = useClose(done);
  const [opts, setOpts] = useState<UnzipOptions>({ mode: "0", dir: "", code: "utf-8" });
  const ok = () => (opts.mode == "1" && !opts.dir ? reportErrorMsg(t("TXT_CODE_4ea93630")) : close(opts));
  return (
    <Shell open={open} title={t("TXT_CODE_7669fd3f")} onOk={ok} onCancel={() => close()}>
      <p></p>
      <Space orientation="vertical" className="w-100">
        <Typography.Title level={5}>{t("TXT_CODE_a6453188")}</Typography.Title>
        <Radio.Group optionType="button" value={opts.mode} onChange={(e) => setOpts({ ...opts, mode: e.target.value })}>
          <Radio.Button value="0">{t("TXT_CODE_7907c99")}</Radio.Button>
          <Radio.Button value="1">{t("TXT_CODE_329fb904")}</Radio.Button>
        </Radio.Group>
        {opts.mode == "1" && <Input value={opts.dir} placeholder={t("TXT_CODE_377e5535")} onChange={(e) => setOpts({ ...opts, dir: e.target.value })} />}
      </Space>
      <Space orientation="vertical" className="w-100 mt-16">
        <Typography.Title level={5}>{t("TXT_CODE_2841f4a")}</Typography.Title>
        {getCurrentLang() == "zh_cn" && (
          <Typography.Text type="secondary">
            {t("TXT_CODE_b278707d")}
            <br />
            {t("TXT_CODE_48044fc2")}
            <br />
            {t("TXT_CODE_76a82338")}
          </Typography.Text>
        )}
        <Radio.Group optionType="button" value={opts.code} onChange={(e) => setOpts({ ...opts, code: e.target.value })}>
          <Radio.Button value="utf-8">UTF-8</Radio.Button>
          <Radio.Button value="gbk">GBK</Radio.Button>
          <Radio.Button value="big5">BIG5</Radio.Button>
        </Radio.Group>
      </Space>
    </Shell>
  );
}

/** Ask where to extract and which file-name encoding the archive uses. */
export function openUnzipDialog(): Promise<UnzipOptions | undefined> {
  return openDialog<UnzipOptions | undefined>((done) => <UnzipDialog done={done} />);
}

type PermissionData = Permission["data"];
const ROLES: { key: string; role: keyof PermissionData }[] = [
  { key: "TXT_CODE_2e5d3d0f", role: "owner" },
  { key: "TXT_CODE_e7b75c0e", role: "usergroup" },
  { key: "TXT_CODE_5c54f599", role: "everyone" }
];

function PermissionDialog({ initial, done }: { initial: PermissionData; done: (v?: { data: PermissionData; deep: boolean }) => void }) {
  const { open, close } = useClose(done);
  const [data, setData] = useState<PermissionData>(initial);
  const [deep, setDeep] = useState(false);
  return (
    <Modal open={open} title={t("TXT_CODE_16853efe")} style={{ maxWidth: 400 }} onOk={() => close({ data, deep })} onCancel={() => close()} destroyOnHidden>
      <p></p>
      <Space orientation="vertical" className="w-100 select-none">
        <Spin spinning={false}>
          <div className="flex-between permission">
            {ROLES.map((item) => (
              <Checkbox.Group key={item.role} value={data[item.role]} onChange={(v) => setData({ ...data, [item.role]: v as string[] })}>
                <Row className="direction-column son">
                  <Typography.Text className="mb-10">
                    <strong>{t(item.key)}</strong>
                  </Typography.Text>
                  <Col className="mb-10 options">
                    <Checkbox value="4">{t("TXT_CODE_798f592e")}</Checkbox>
                  </Col>
                  <Col className="mb-10 options">
                    <Checkbox value="2">{t("TXT_CODE_46c4e9ac")}</Checkbox>
                  </Col>
                  <Col className="mb-10 options">
                    <Checkbox value="1">{t("TXT_CODE_e97669d8")}</Checkbox>
                  </Col>
                </Row>
              </Checkbox.Group>
            ))}
          </div>
          <Checkbox checked={deep} className="mt-15" onChange={(e) => setDeep(e.target.checked)}>
            {t("TXT_CODE_74fd665e")}
          </Checkbox>
        </Spin>
      </Space>
    </Modal>
  );
}

/** Edit rwx bits for owner, group and everyone, plus "apply to subfolders". */
export function openPermissionDialog(initial: PermissionData): Promise<{ data: PermissionData; deep: boolean } | undefined> {
  return openDialog((done) => <PermissionDialog initial={initial} done={done} />);
}
