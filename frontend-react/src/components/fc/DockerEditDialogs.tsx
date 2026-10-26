/**
 * Table editors for Docker settings (port of components/fc KvOptionsDialog,
 * DockerPortDialog, DockerCapabilityDialog and DockerDeviceDialog).
 * Each resolves with the edited rows, or with the original rows on cancel
 * (upstream resolved [] on cancel, which wiped the setting; keeping the
 * original rows is the safer behaviour).
 *
 * SECURITY: these only shape input. The daemon validates volumes, devices,
 * capabilities and ports against its own Johnnykins Docker gates.
 */
import { MinusCircleOutlined, PlusCircleOutlined } from "@ant-design/icons";
import { App, Button, Checkbox, Input, InputNumber, Modal, Select, Table, type TableColumnsType } from "antd";
import { useState, type ReactNode } from "react";
import SafeHtml from "@/components/SafeHtml";
import { t } from "@/lang/i18n";
import { openDialog } from "@/stores/dialogHost";

type Row = Record<string, string | number | boolean | undefined>;

interface ColumnDef {
  key: string;
  title: string;
  kind?: "text" | "textarea" | "select";
  options?: { label: string; value: string }[];
  placeholder?: string;
  required?: boolean;
}

interface ShellProps {
  title: string;
  subTitle?: ReactNode;
  columns: TableColumnsType<Row & { _i: number }>;
  rows: Row[];
  onAdd: () => void;
  onOk: () => void;
  onCancel: () => void;
  open: boolean;
  size?: "small" | "middle";
}

function Shell({ title, subTitle, columns, rows, onAdd, onOk, onCancel, open, size }: ShellProps) {
  return (
    <Modal
      open={open}
      centered
      width={1300}
      mask={{ closable: false }}
      title={title}
      okText={t("TXT_CODE_d507abff")}
      cancelText={t("TXT_CODE_a0451c97")}
      onOk={onOk}
      onCancel={onCancel}
    >
      <div className="dialog-overflow-container">
        {subTitle && (
          <div style={{ fontSize: 14 }} className="text-gray-400 mb-4">
            {subTitle}
          </div>
        )}
        <div className="flex justify-end mb-20">
          <Button icon={<PlusCircleOutlined />} onClick={onAdd}>
            {t("TXT_CODE_dfc17a0c")}
          </Button>
        </div>
        <Table<Row & { _i: number }>
          rowKey="_i"
          dataSource={rows.map((r, i) => ({ ...r, _i: i }))}
          columns={columns}
          pagination={false}
          scroll={{ x: 542 }}
          size={size}
        />
      </div>
    </Modal>
  );
}

function useRows<T extends Row>(initial: T[]) {
  const [rows, setRows] = useState<T[]>(() => initial.map((r) => ({ ...r })));
  const [showErrors, setShowErrors] = useState(false);
  const set = (i: number, patch: Partial<T>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return { rows, setRows, set, showErrors, setShowErrors };
}

const isEmpty = (v: unknown) => v === undefined || v === null || String(v).trim() === "";

function GenericTableDialog({
  title,
  subTitle,
  columns,
  data,
  done
}: {
  title: string;
  subTitle?: string;
  columns: ColumnDef[];
  data: Row[];
  done: (rows: Row[]) => void;
}) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(true);
  const { rows, setRows, set, showErrors, setShowErrors } = useRows(data);
  const finish = (result: Row[]) => {
    setOpen(false);
    done(result);
  };
  const submit = () => {
    const missing = rows.some((r) => columns.some((c) => c.required !== false && isEmpty(r[c.key])));
    if (missing) {
      setShowErrors(true);
      return void message.error(t("TXT_CODE_cb08d342"));
    }
    finish(rows);
  };

  const tableColumns: TableColumnsType<Row & { _i: number }> = [
    ...columns.map((c) => ({
      align: "center" as const,
      key: c.key,
      title: c.title,
      render: (_: unknown, r: Row & { _i: number }) => {
        const status = showErrors && c.required !== false && isEmpty(r[c.key]) ? ("error" as const) : undefined;
        const value = r[c.key] == null ? undefined : String(r[c.key]);
        if (c.kind === "select") return <Select style={{ width: "100%" }} value={value} options={c.options} status={status} onChange={(v) => set(r._i, { [c.key]: v })} />;
        if (c.kind === "textarea")
          return <Input.TextArea rows={3} value={value} placeholder={c.placeholder} status={status} onChange={(e) => set(r._i, { [c.key]: e.target.value })} />;
        return <Input value={value} placeholder={c.placeholder} status={status} onChange={(e) => set(r._i, { [c.key]: e.target.value })} />;
      }
    })),
    {
      align: "center",
      key: "operation",
      title: t("TXT_CODE_fe731dfc"),
      render: (_, r) => <Button icon={<MinusCircleOutlined />} danger onClick={() => setRows((rs) => rs.filter((_, j) => j !== r._i))} />
    }
  ];

  return (
    <Shell
      open={open}
      title={title}
      subTitle={subTitle ? <SafeHtml html={subTitle} /> : undefined}
      columns={tableColumns}
      rows={rows}
      onAdd={() => setRows((rs) => [...rs, Object.fromEntries(columns.map((c) => [c.key, c.kind === "select" ? c.options?.[0]?.value : ""]))])}
      onOk={submit}
      onCancel={() => finish(data)}
    />
  );
}

function openTableDialog<T>(title: string, columns: ColumnDef[], data: T[], subTitle?: string): Promise<T[]> {
  return openDialog<T[]>((done) => (
    <GenericTableDialog title={title} subTitle={subTitle} columns={columns} data={data as unknown as Row[]} done={(rows) => done(rows as unknown as T[])} />
  ));
}

// ---- Typed openers matching upstream components/fc/index.ts ----

export interface DockerConfigItem {
  host: string;
  container: string;
}
export interface PortConfigItem extends DockerConfigItem {
  protocol: string;
}
export interface KvItem {
  label: string;
  value: string;
}
export interface DockerDeviceItem {
  PathOnHost: string;
  PathInContainer?: string;
  CgroupPermissions?: string;
}

const kvColumns = (): ColumnDef[] => [
  { key: "label", title: t("TXT_CODE_a42984e"), kind: "textarea" },
  { key: "value", title: t("TXT_CODE_115e8a25"), kind: "textarea" }
];

export const openVolumeEditDialog = (data: DockerConfigItem[]) =>
  openTableDialog(
    t("TXT_CODE_820ebc92"),
    [
      { key: "host", title: t("TXT_CODE_681aaeb9"), kind: "textarea" },
      { key: "container", title: t("TXT_CODE_30258325"), kind: "textarea" }
    ],
    data,
    t("TXT_CODE_6c232c9c")
  );

export const openDockerEnvEditDialog = (data: KvItem[]) => openTableDialog(t("TXT_CODE_90a9d317"), kvColumns(), data);

export const openDockerLabelEditDialog = (data: KvItem[]) => openTableDialog(t("TXT_CODE_g1c43s2h"), kvColumns(), data, t("TXT_CODE_MimBB1Ea"));

export const openDockerCapabilityEditDialog = (data: KvItem[]) =>
  openTableDialog(
    t("TXT_CODE_bbbd4133"),
    [
      { key: "label", title: t("TXT_CODE_d51db65a"), placeholder: t("TXT_CODE_9227a967") },
      {
        key: "value",
        title: t("TXT_CODE_adea33ce"),
        kind: "select",
        options: [
          { label: t("TXT_CODE_a1d885c1"), value: "add" },
          { label: t("TXT_CODE_fac5dc49"), value: "drop" }
        ]
      }
    ],
    data,
    t("TXT_CODE_377319df")
  );

export const openDockerDeviceEditDialog = (data: DockerDeviceItem[]) =>
  openTableDialog(
    t("TXT_CODE_b3a60c78"),
    [
      { key: "PathOnHost", title: t("TXT_CODE_e4a82ac7"), placeholder: t("TXT_CODE_1d8ece48") },
      { key: "PathInContainer", title: t("TXT_CODE_ef6115b7"), placeholder: t("TXT_CODE_1d8ece49"), required: false },
      { key: "CgroupPermissions", title: t("TXT_CODE_511aea70"), placeholder: t("TXT_CODE_7595d100"), required: false }
    ],
    data,
    t("TXT_CODE_b6e18b87")
  );

// ---- Port mappings, with {mcsm_portN} auto-assignment (DockerPortDialog.vue) ----

interface PortRow extends PortConfigItem {
  autoHost: boolean;
  autoContainer: boolean;
}

const mcsmPort = (s: string) => String(s ?? "").match(/\{mcsm_port(\d+)\}/);

/** Smallest positive number not yet used by an auto-assigned port. */
const nextFree = (used: number[]) => {
  for (let i = 1; ; i++) if (!used.includes(i)) return i;
};

function PortDialog({ data, done }: { data: PortConfigItem[]; done: (rows: PortConfigItem[]) => void }) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(true);
  const [showErrors, setShowErrors] = useState(false);
  const [rows, setRows] = useState<PortRow[]>(() =>
    data.map((d) => ({ ...d, autoHost: mcsmPort(d.host) !== null, autoContainer: mcsmPort(d.container) !== null }))
  );
  const finish = (result: PortConfigItem[]) => {
    setOpen(false);
    done(result);
  };
  const usedPorts = (list: PortRow[], skip?: { i: number; field: "host" | "container" }) => {
    const used: number[] = [];
    list.forEach((r, i) => {
      (["host", "container"] as const).forEach((f) => {
        if (skip && skip.i === i && skip.field === f) return;
        const auto = f === "host" ? r.autoHost : r.autoContainer;
        const m = mcsmPort(r[f]);
        if (auto && m) used.push(parseInt(m[1]));
      });
    });
    return used;
  };

  const toggleAuto = (i: number, field: "host" | "container") =>
    setRows((list) =>
      list.map((r, j) => {
        if (j !== i) return r;
        const autoKey = field === "host" ? "autoHost" : "autoContainer";
        const other = field === "host" ? "container" : "host";
        const otherAuto = field === "host" ? r.autoContainer : r.autoHost;
        if (r[autoKey]) return { ...r, [autoKey]: false, [field]: "" };
        // Reuse the other side's {mcsm_portN} when it is auto-assigned, else take the next free N.
        const otherMatch = mcsmPort(r[other]);
        const n = otherMatch && otherAuto ? parseInt(otherMatch[1]) : nextFree(usedPorts(list, { i, field }));
        return { ...r, [autoKey]: true, [field]: `{mcsm_port${n}}` };
      })
    );

  const set = (i: number, patch: Partial<PortRow>) => setRows((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const err = (v: unknown) => (showErrors && isEmpty(v) ? ("error" as const) : undefined);

  const submit = () => {
    if (rows.some((r) => isEmpty(r.host) || isEmpty(r.container) || isEmpty(r.protocol))) {
      setShowErrors(true);
      return void message.error(t("TXT_CODE_cb08d342"));
    }
    finish(rows.map(({ host, container, protocol }) => ({ host: String(host), container: String(container), protocol })));
  };

  type R = PortRow & { _i: number };
  const columns: TableColumnsType<R> = [
    {
      align: "center",
      key: "host",
      title: t("TXT_CODE_534db0b2"),
      render: (_, r) => (
        <div className="flex-center flex-row">
          <Input
            className="w-full"
            size="large"
            value={r.host}
            status={err(r.host)}
            placeholder="eg: 8080 or {mcsm_port1}"
            disabled={r.autoHost}
            onChange={(e) => set(r._i, { host: e.target.value })}
          />
          <Checkbox className="ml-12" style={{ width: 114 }} checked={r.autoHost} onChange={() => toggleAuto(r._i, "host")}>
            {t("TXT_CODE_6f1129fb")}
          </Checkbox>
        </div>
      )
    },
    {
      align: "center",
      key: "container",
      title: t("TXT_CODE_b729d2e"),
      render: (_, r) => (
        <div className="flex-center flex-row">
          {r.autoContainer ? (
            <Input className="w-full" size="large" value={r.container} disabled />
          ) : (
            <InputNumber
              className="w-full"
              size="large"
              min={1}
              max={65535}
              precision={0}
              value={r.container === "" ? null : Number(r.container)}
              status={err(r.container)}
              placeholder="eg: 25565 or {mcsm_port1}"
              onChange={(v) => set(r._i, { container: v == null ? "" : String(v) })}
            />
          )}
          <Checkbox className="ml-12" style={{ width: 114 }} checked={r.autoContainer} onChange={() => toggleAuto(r._i, "container")}>
            {t("TXT_CODE_6f1129fb")}
          </Checkbox>
        </div>
      )
    },
    {
      align: "center",
      key: "protocol",
      title: t("TXT_CODE_ad1c674c"),
      render: (_, r) => (
        <Select
          style={{ width: "100%" }}
          value={r.protocol}
          placeholder="tcp/udp"
          options={[
            { label: "TCP", value: "tcp" },
            { label: "UDP", value: "udp" }
          ]}
          onChange={(v) => set(r._i, { protocol: v })}
        />
      )
    },
    {
      align: "center",
      key: "operation",
      title: t("TXT_CODE_fe731dfc"),
      render: (_, r) => <Button icon={<MinusCircleOutlined />} danger onClick={() => setRows((list) => list.filter((_, j) => j !== r._i))} />
    }
  ];

  return (
    <Shell
      open={open}
      size="small"
      title={t("TXT_CODE_c4435af9")}
      subTitle={t("TXT_CODE_56b9e6af", { mcsm_port1: "{mcsm_port1}", mcsm_port5: "{mcsm_port5}" })}
      columns={columns as unknown as ShellProps["columns"]}
      rows={rows as unknown as Row[]}
      onAdd={() => setRows((list) => [...list, { protocol: "tcp", host: "", container: "", autoHost: false, autoContainer: false }])}
      onOk={submit}
      onCancel={() => finish(data)}
    />
  );
}

export const openPortEditDialog = (data: PortConfigItem[]) => openDialog<PortConfigItem[]>((done) => <PortDialog data={data} done={done} />);
