/**
 * Users page (port of widgets/UserList.vue): search by name and role, paging,
 * multi-select delete, add/edit user dialog, SSO unbind, and a link to each
 * user's instance assignments.
 *
 * Security:
 * - Authorization is enforced by the panel (/api/auth* require admin); this
 *   page only hides controls.
 * - Passwords are checked against the panel's rule before sending and are
 *   never displayed back; editing a user leaves the password unchanged unless
 *   a new one is typed (the field starts empty, as upstream).
 * - API keys are never shown, only whether one exists.
 */
import { DownOutlined, SearchOutlined, UserOutlined } from "@ant-design/icons";
import { App, Button, Col, Dropdown, Form, Input, Modal, Row, Select, Space, Spin, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useRef, useState } from "react";
import BetweenMenus from "@/components/BetweenMenus";
import CardPanel from "@/components/CardPanel";
import { permissionLabel, permissionMap } from "@/config/const";
import type { WidgetProps } from "@/config/widgets";
import { useAppRouters } from "@/hooks/useAppRouters";
import { useScreen } from "@/hooks/useScreen";
import { t } from "@/lang/i18n";
import { addUser, deleteUsers, editUserInfo, searchUsers, ssoUnbind, type EditUserInfo, type UserSearchResult } from "@/services/apis/user";
import { isWebAdminUser, useAppState } from "@/stores/appState";
import { PASSWORD_REGEX, reportErrorMsg } from "@/tools/validator";
import { ROLE, type BaseUserInfo } from "@/types";
import "./UserList.scss";

const emptyUser: EditUserInfo = {
  uuid: "",
  userName: "",
  passWord: "",
  loginTime: "",
  registerTime: "",
  instances: [],
  permission: 1,
  apiKey: "",
  isInit: false,
  secret: "",
  open2FA: false,
  ssoSub: "",
  ssoBound: false
};

export default function UserList({ card }: WidgetProps) {
  const { message, modal } = App.useApp();
  const { isPhone } = useScreen();
  const { toPage } = useAppRouters();
  const ssoEnabled = useAppState((s) => !!s.settings?.ssoEnabled);
  const me = useAppState((s) => s.userInfo);
  const webAdminEnforced = useAppState((s) => !!s.settings?.webAdminEnforced);

  const [form, setForm] = useState({ name: "", currentPage: 1, pageSize: 20, role: "" });
  const formRef = useRef(form);
  formRef.current = form;
  const [data, setData] = useState<UserSearchResult>();
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    const f = formRef.current;
    setLoading(true);
    try {
      const res = await searchUsers({
        params: { userName: f.name, page: Math.max(1, f.currentPage), page_size: f.pageSize, role: f.role },
        forceRequest: true
      });
      setData(res);
    } catch (err) {
      reportErrorMsg(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Upstream throttles search and refresh to one call per 600 ms.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const search = (patch: Partial<typeof form>) => {
    formRef.current = { ...formRef.current, ...patch, currentPage: 1 };
    setForm(formRef.current);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void fetchData(), 600);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const removeUsers = async (uuids: string[]) => {
    try {
      await deleteUsers({ data: uuids });
      message.success(t("TXT_CODE_28190dbc"));
      setSelected((s) => s.filter((id) => !uuids.includes(id)));
      await fetchData();
    } catch (err) {
      reportErrorMsg(err);
    }
  };

  const batchDelete = () => {
    if (selected.length === 0) return void message.warning(t("TXT_CODE_d78ad17a"));
    void removeUsers(selected);
  };

  const confirmDelete = (user: BaseUserInfo) =>
    modal.confirm({
      title: t("TXT_CODE_e99ab99a", { userName: user.userName }),
      okType: "danger",
      mask: { closable: true },
      onOk: () => removeUsers([user.uuid])
    });

  const confirmSsoUnbind = (user: BaseUserInfo) =>
    modal.confirm({
      title: t("TXT_CODE_SSO_UNBIND_CONFIRM", { userName: user.userName }),
      okType: "danger",
      mask: { closable: true },
      onOk: async () => {
        try {
          await ssoUnbind({ data: { uuid: user.uuid } });
          message.success(t("TXT_CODE_SSO_UNBIND_SUCCESS"));
          await fetchData();
        } catch (err) {
          reportErrorMsg(err);
        }
      }
    });

  // ---- add / edit dialog ----
  const [dialog, setDialog] = useState<{ open: boolean; addMode: boolean; title: string }>({ open: false, addMode: true, title: "" });
  const [editing, setEditing] = useState<EditUserInfo>(emptyUser);
  const [saving, setSaving] = useState(false);
  const [userForm] = Form.useForm<EditUserInfo>();

  const openAdd = () => {
    setEditing(structuredClone(emptyUser));
    setDialog({ open: true, addMode: true, title: t("TXT_CODE_e83ffa03") });
  };
  const openEdit = (user: BaseUserInfo) => {
    setEditing({ ...structuredClone(user), passWord: "" });
    setDialog({ open: true, addMode: false, title: t("TXT_CODE_79f9a172") });
  };

  const submitUser = async () => {
    let values: EditUserInfo;
    try {
      values = await userForm.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      if (dialog.addMode) {
        await addUser({ data: { username: values.userName, password: values.passWord ?? "", permission: Number(values.permission) } });
        message.success(t("TXT_CODE_c855fc29"));
      } else {
        const config: EditUserInfo = { ...editing, ...values, permission: Number(values.permission) };
        if (!config.passWord) delete config.passWord;
        await editUserInfo({ data: { config, uuid: editing.uuid } });
        message.success(t("TXT_CODE_27efac3b"));
      }
      setDialog((d) => ({ ...d, open: false }));
    } catch (err) {
      reportErrorMsg(err);
    } finally {
      setSaving(false);
      void fetchData();
    }
  };

  const passwordRule = {
    validator: async (_: unknown, value: string) => {
      if (!dialog.addMode && !value) return;
      if (!PASSWORD_REGEX.test(value ?? "")) throw new Error(t("TXT_CODE_6032f5a3"));
    },
    validateTrigger: "onBlur"
  };

  // Web Admin can be granted by Web Admins, or by an admin before enforcement
  // (the panel allows that only while no Web Admin exists).
  const permissionOptions = Object.entries(permissionMap())
    .map(([value, label]) => ({ value: Number(value), label }))
    .filter((o) => o.value !== ROLE.WEBADMIN || isWebAdminUser(me) || !webAdminEnforced);

  const columns: ColumnsType<BaseUserInfo> = [
    ...(!isPhone ? [{ align: "center" as const, title: "UUID", dataIndex: "uuid", key: "uuid" }] : []),
    { align: "center", title: t("TXT_CODE_eb9fcdad"), dataIndex: "userName", key: "userName", minWidth: 200 },
    {
      align: "center",
      title: t("TXT_CODE_511aea70"),
      dataIndex: "permission",
      key: "permission",
      minWidth: 200,
      render: (v: number) => permissionLabel(v)
    },
    ...(!isPhone
      ? [
          { align: "center" as const, title: t("TXT_CODE_d7ee9ba"), dataIndex: "loginTime", key: "loginTime", minWidth: 200 },
          { align: "center" as const, title: t("TXT_CODE_c5c56801"), dataIndex: "registerTime", key: "registerTime", minWidth: 200 }
        ]
      : []),
    ...(!isPhone && ssoEnabled
      ? [
          {
            align: "center" as const,
            title: t("TXT_CODE_SSO_BOUND_STATUS"),
            dataIndex: "ssoBound",
            key: "ssoBound",
            minWidth: 100,
            render: (bound: boolean) =>
              bound ? <Tag color="green">{t("TXT_CODE_SSO_BOUND_YES")}</Tag> : <Tag>{t("TXT_CODE_SSO_BOUND_NO")}</Tag>
          }
        ]
      : []),
    {
      align: "center",
      title: t("TXT_CODE_fe731dfc"),
      key: "action",
      minWidth: 200,
      render: (_, record) => (
        <Dropdown
          menu={{
            items: [
              { key: "1", label: t("TXT_CODE_236f70aa"), onClick: () => openEdit(record) },
              { key: "2", label: t("TXT_CODE_4d934e3a"), onClick: () => toPage({ path: "/users/resources", query: { uuid: record.uuid } }) },
              ...(ssoEnabled && record.ssoBound ? [{ key: "sso_unbind", label: t("TXT_CODE_SSO_UNBIND"), onClick: () => confirmSsoUnbind(record) }] : []),
              { key: "3", label: t("TXT_CODE_ecbd7449"), onClick: () => confirmDelete(record) }
            ]
          }}
        >
          <Button size="large">
            {t("TXT_CODE_fe731dfc")}
            <DownOutlined />
          </Button>
        </Dropdown>
      )
    }
  ];

  return (
    <>
      <Modal
        open={dialog.open}
        centered
        destroyOnHidden
        title={dialog.title}
        confirmLoading={saving}
        onOk={submitUser}
        onCancel={() => setDialog((d) => ({ ...d, open: false }))}
      >
        <Form form={userForm} layout="vertical" preserve={false} initialValues={editing}>
          <Form.Item required label={t("TXT_CODE_511aea70")}>
            <Typography.Paragraph>
              <Typography.Text type="secondary">{t("TXT_CODE_21b8b71a")}</Typography.Text>
            </Typography.Paragraph>
            <Form.Item noStyle name="permission" rules={[{ required: true, message: t("TXT_CODE_3bb646e4") }]}>
              <Select options={permissionOptions} />
            </Form.Item>
          </Form.Item>
          <Form.Item required label={t("TXT_CODE_eb9fcdad")}>
            <Typography.Paragraph>
              <Typography.Text type="secondary">{t("TXT_CODE_1987587b")}</Typography.Text>
            </Typography.Paragraph>
            <Form.Item
              noStyle
              name="userName"
              validateTrigger={["onChange", "onBlur"]}
              rules={[
                { required: true, message: t("TXT_CODE_2695488c") },
                { min: 3, max: 20, message: t("TXT_CODE_3f477ec"), validateTrigger: "onBlur" }
              ]}
            >
              <Input placeholder={t("TXT_CODE_4ea93630")} />
            </Form.Item>
          </Form.Item>
          <Form.Item required={dialog.addMode} label={t("TXT_CODE_551b0348")}>
            <Typography.Paragraph>
              <Typography.Text type="secondary">{dialog.addMode ? t("TXT_CODE_1f2062c7") : t("TXT_CODE_af1f921d")}</Typography.Text>
            </Typography.Paragraph>
            <Form.Item noStyle name="passWord" rules={[passwordRule]} validateTrigger={["onChange", "onBlur"]}>
              {/* SECURITY: masked input; upstream showed the new password in clear text (CWE-549). */}
              <Input.Password placeholder={t("TXT_CODE_4ea93630")} autoComplete="new-password" />
            </Form.Item>
          </Form.Item>
          {!dialog.addMode && (
            <Form.Item label="APIKEY">
              {editing.apiKey ? (
                <Input value={t("TXT_CODE_2f56b56e")} readOnly />
              ) : (
                <Typography.Paragraph>{t("TXT_CODE_6c274bdc")}</Typography.Paragraph>
              )}
            </Form.Item>
          )}
          {dialog.addMode && (
            <Form.Item required label={t("TXT_CODE_ef0ce2e")}>
              <Typography.Paragraph>
                <Typography.Text type="secondary">
                  {t("TXT_CODE_9e9d3767")}
                  <br />
                  <a href="https://docs.mcsmanager.com/" target="_blank" rel="noopener noreferrer">
                    {t("TXT_CODE_b01f8383")}
                  </a>
                </Typography.Text>
              </Typography.Paragraph>
            </Form.Item>
          )}
        </Form>
      </Modal>

      <div style={{ height: "100%" }} className="container UserList">
        <Row gutter={[24, 24]} style={{ height: "100%" }}>
          <Col span={24}>
            <BetweenMenus
              left={
                !isPhone && (
                  <Typography.Title className="mb-0" level={4}>
                    <UserOutlined /> {card.title} ({data?.total ?? 0})
                  </Typography.Title>
                )
              }
              right={
                <>
                  <Button loading={loading} onClick={() => void fetchData()}>
                    {t("TXT_CODE_b76d94e0")}
                  </Button>
                  <Dropdown
                    menu={{
                      items: [
                        { key: "1", label: t("TXT_CODE_e83ffa03"), onClick: openAdd },
                        { key: "2", label: t("TXT_CODE_ecbd7449"), onClick: batchDelete }
                      ]
                    }}
                  >
                    <Button type="primary">
                      {t("TXT_CODE_f7084f84")}
                      <DownOutlined />
                    </Button>
                  </Dropdown>
                </>
              }
              center={
                <div className="search-input">
                  <Space.Compact style={{ width: "100%" }}>
                    <Select
                      value={form.role}
                      style={{ width: 100 }}
                      onChange={(role) => search({ role })}
                      options={[
                        { value: "", label: t("TXT_CODE_c48f6f64") },
                        ...Object.entries(permissionMap()).map(([value, label]) => ({ value, label }))
                      ]}
                    />
                    <Input
                      value={form.name}
                      placeholder={t("TXT_CODE_2471b9c")}
                      allowClear
                      style={{ width: "calc(100% - 100px)" }}
                      suffix={<SearchOutlined />}
                      onChange={(e) => search({ name: e.target.value.trim() })}
                    />
                  </Space.Compact>
                </div>
              }
            />
          </Col>
          <Col span={24}>
            <CardPanel style={{ height: "100%" }}>
              <Spin spinning={loading && !data}>
                <Table<BaseUserInfo>
                  rowKey="uuid"
                  rowSelection={{ selectedRowKeys: selected, preserveSelectedRowKeys: true, onChange: (keys) => setSelected(keys as string[]) }}
                  dataSource={data?.data}
                  columns={columns}
                  pagination={{
                    size: "middle",
                    current: form.currentPage,
                    pageSize: form.pageSize,
                    hideOnSinglePage: false,
                    total: data?.total ?? 0,
                    showSizeChanger: true
                  }}
                  onChange={(p) => {
                    formRef.current = { ...formRef.current, currentPage: p.current || 1, pageSize: p.pageSize || 20 };
                    setForm(formRef.current);
                    void fetchData();
                  }}
                />
              </Spin>
            </CardPanel>
          </Col>
        </Row>
      </div>
    </>
  );
}
