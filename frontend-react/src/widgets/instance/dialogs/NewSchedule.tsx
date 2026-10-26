/**
 * Create / edit a scheduled task (port of widgets/instance/dialogs/NewSchedule.vue).
 *
 * Editing replaces the task: the daemon has no update call, so the old task
 * is deleted and the new one registered. Upstream lost the task if the second
 * step failed; here the original is registered again in that case.
 */
import { MinusCircleOutlined, PlusCircleOutlined } from "@ant-design/icons";
import { App, Button, Checkbox, Col, DatePicker, Flex, Form, Input, InputNumber, Modal, Row, Select, Space, TimePicker, Typography } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { calculateIntervalFromTime, calculateTimeFromCycle, createSchedule, parseTaskTime, removeSchedule, scheduleTimeFromForm } from "@/hooks/useSchedule";
import { t } from "@/lang/i18n";
import { openDialog } from "@/stores/dialogHost";
import { reportErrorMsg } from "@/tools/validator";
import {
  ScheduleActionTypeEnum,
  ScheduleCreateType,
  scheduleActionTypeLabels,
  scheduleTypeLabels,
  type Schedule,
  type ScheduleAction,
  type ScheduleTaskForm
} from "@/types/schedule";

const { Title, Paragraph, Text } = Typography;

const weeks = () => [
  { label: t("TXT_CODE_fcbdcb34"), value: 1 },
  { label: t("TXT_CODE_c73de59d"), value: 2 },
  { label: t("TXT_CODE_85617390"), value: 3 },
  { label: t("TXT_CODE_c9b31f8e"), value: 4 },
  { label: t("TXT_CODE_d4517dcb"), value: 5 },
  { label: t("TXT_CODE_d248b5c8"), value: 6 },
  { label: t("TXT_CODE_a621f370"), value: 7 }
];

const defaultAction = (): ScheduleAction => ({ type: "command", payload: "" });

function initialForm(task?: Schedule): ScheduleTaskForm {
  const form: ScheduleTaskForm = {
    name: "",
    count: 0,
    type: ScheduleCreateType.INTERVAL,
    time: "",
    actions: [defaultAction()],
    weekend: [],
    cycle: ["0", "0", "0"],
    objTime: dayjs()
  };
  if (!task) return form;
  Object.assign(form, structuredClone({ name: task.name, time: task.time, type: task.type, actions: task.actions?.length ? task.actions : [defaultAction()] }));
  form.count = Number(task.count) === -1 ? "" : Number(task.count);
  if (task.type === ScheduleCreateType.INTERVAL) form.cycle = calculateIntervalFromTime(task.time);
  else if (task.type === ScheduleCreateType.CYCLE) {
    const parsed = calculateTimeFromCycle(task.time);
    if (parsed) Object.assign(form, parsed);
  } else {
    const parsed = parseTaskTime(task.time);
    if (parsed) form.objTime = parsed;
  }
  return form;
}

const placeholderFor = (action: ScheduleAction) =>
  action.type === ScheduleActionTypeEnum.Delay ? t("TXT_CODE_bb760145") : action.type === ScheduleActionTypeEnum.Command ? t("TXT_CODE_8ff89011") : undefined;

interface Props {
  instanceId: string;
  daemonId: string;
  task?: Schedule;
  done: (saved: boolean) => void;
}

function NewSchedule({ instanceId, daemonId, task, done }: Props) {
  const { notification } = App.useApp();
  const editMode = !!task;
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<ScheduleTaskForm>(() => initialForm(task));
  // Upstream warns when a saved time string cannot be parsed back into the form.
  useEffect(() => {
    if (!task || task.type === ScheduleCreateType.INTERVAL) return;
    const ok = task.type === ScheduleCreateType.CYCLE ? calculateTimeFromCycle(task.time) : parseTaskTime(task.time);
    if (!ok) notification.error({ title: t("TXT_CODE_afabf3ca") });
  }, [task, notification]);

  const set = (patch: Partial<ScheduleTaskForm>) => setForm((f) => ({ ...f, ...patch }));
  const setAction = (i: number, patch: Partial<ScheduleAction>) => setForm((f) => ({ ...f, actions: f.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) }));

  const close = (saved: boolean) => {
    setOpen(false);
    done(saved);
  };

  const submit = async () => {
    let time: string;
    try {
      time = scheduleTimeFromForm(form);
    } catch (err) {
      return reportErrorMsg(err);
    }
    setLoading(true);
    try {
      if (editMode) await removeSchedule(instanceId, daemonId, form.name);
      try {
        await createSchedule(instanceId, daemonId, { ...form, time });
      } catch (err) {
        // Put the original task back so a failed edit does not delete it.
        if (editMode && task) await createSchedule(instanceId, daemonId, task).catch(() => undefined);
        throw err;
      }
      notification.success({ title: editMode ? t("TXT_CODE_d3de39b4") : t("TXT_CODE_d28c05df") });
      close(true);
    } catch (err) {
      reportErrorMsg(err);
    } finally {
      setLoading(false);
    }
  };

  const delAction = (i: number) => {
    if (form.actions.length === 1) return reportErrorMsg(t("TXT_CODE_a749763b"));
    setForm((f) => ({ ...f, actions: f.actions.filter((_, j) => j !== i) }));
  };

  const countField = (
    <Form.Item>
      <Title level={5}>{t("TXT_CODE_d9cfab1b")}</Title>
      <InputNumber
        value={form.count === "" ? null : Number(form.count)}
        size="large"
        className="w-100"
        placeholder={t("TXT_CODE_a59981f4")}
        onChange={(v) => set({ count: v ?? "" })}
      />
    </Form.Item>
  );

  const actionLabels = scheduleActionTypeLabels();

  return (
    <Modal
      open={open}
      centered
      width={660}
      mask={{ closable: false }}
      title={editMode ? t("TXT_CODE_1548649e") : t("TXT_CODE_3502273d")}
      confirmLoading={loading}
      destroyOnHidden
      okText={t("TXT_CODE_abfe9512")}
      onOk={submit}
      onCancel={() => close(false)}
    >
      <Form.Item>
        <Title level={5}>{t("TXT_CODE_b290a4b0")}</Title>
        <Paragraph>
          <Text type="secondary">{t("TXT_CODE_b72d638d")}</Text>
        </Paragraph>
        <Input value={form.name} disabled={editMode} onChange={(e) => set({ name: e.target.value })} />
      </Form.Item>

      <Form.Item>
        <Title level={5}>{t("TXT_CODE_a62c99d1")}</Title>
        <Select
          value={form.type}
          placeholder={t("TXT_CODE_3bb646e4")}
          popupMatchSelectWidth={false}
          onChange={(v) => set({ type: v })}
          options={Object.entries(scheduleTypeLabels()).map(([k, label]) => ({ value: Number(k), label }))}
        />
      </Form.Item>

      {form.type === ScheduleCreateType.INTERVAL && (
        <>
          <Form.Item>
            <Paragraph>
              <Title level={5}>{t("TXT_CODE_3554dac0")}</Title>
              <Text>{t("TXT_CODE_f17889f4")}</Text>
            </Paragraph>
            <Row gutter={[24, 24]}>
              {[
                [2, "TXT_CODE_4e2c7f64"],
                [1, "TXT_CODE_a7e9ff0f"],
                [0, "TXT_CODE_acabc771"]
              ].map(([i, unit]) => (
                <Col key={i} xs={24} md={8}>
                  <Space.Compact className="w-100">
                    <Input
                      value={form.cycle[i as number]}
                      placeholder={t("TXT_CODE_ba8ebc7")}
                      onChange={(e) => set({ cycle: form.cycle.map((c, j) => (j === i ? e.target.value : c)) })}
                    />
                    <Space.Addon>{t(unit as string)}</Space.Addon>
                  </Space.Compact>
                </Col>
              ))}
            </Row>
          </Form.Item>
          {countField}
        </>
      )}

      {form.type === ScheduleCreateType.CYCLE && (
        <>
          <Form.Item>
            <Title level={5}>{t("TXT_CODE_3554dac0")}</Title>
            <TimePicker value={form.objTime} size="large" placeholder={t("TXT_CODE_38591f72")} className="w-100" onChange={(v) => set({ objTime: v as Dayjs })} />
          </Form.Item>
          <Form.Item>
            <Checkbox.Group value={form.weekend} options={weeks()} onChange={(v) => set({ weekend: v as number[] })} />
          </Form.Item>
          {countField}
        </>
      )}

      {form.type === ScheduleCreateType.SPECIFY && (
        <Form.Item>
          <Title level={5}>{t("TXT_CODE_f3fe5c8e")}</Title>
          <DatePicker value={form.objTime} showTime size="large" className="w-100" onChange={(v) => set({ objTime: v as Dayjs })} />
        </Form.Item>
      )}

      <Form.Item>
        <div className="flex justify-between items-center mb-20">
          <div>
            <Title level={5} style={{ marginBottom: 0 }}>
              {t("TXT_CODE_61811ac")}
            </Title>
            <Paragraph>
              <Text type="secondary">{t("TXT_CODE_81297804")}</Text>
            </Paragraph>
          </div>
          <Button icon={<PlusCircleOutlined />} onClick={() => setForm((f) => ({ ...f, actions: [...f.actions, defaultAction()] }))}>
            {t("TXT_CODE_dfc17a0c")}
          </Button>
        </div>
        {form.actions.map((action, index) => (
          <Form.Item key={index}>
            <Row gutter={[12, 24]}>
              <Col xs={24} md={6}>
                <Select
                  value={action.type}
                  placeholder={t("TXT_CODE_3bb646e4")}
                  popupMatchSelectWidth={false}
                  onChange={(v) => setAction(index, { type: v, payload: "" })}
                  options={Object.entries(actionLabels).map(([value, label]) => ({ value, label }))}
                />
              </Col>
              <Col xs={24} md={16}>
                <Flex>
                  <Input value={action.payload} placeholder={placeholderFor(action)} disabled={!placeholderFor(action)} onChange={(e) => setAction(index, { payload: e.target.value })} />
                </Flex>
              </Col>
              <Col xs={24} md={2}>
                <div>
                  <Button icon={<MinusCircleOutlined />} danger onClick={() => delAction(index)} />
                </div>
              </Col>
            </Row>
          </Form.Item>
        ))}
      </Form.Item>
    </Modal>
  );
}

/** Resolves true when a task was created or updated. */
export function openNewScheduleDialog(instanceId: string, daemonId: string, task?: Schedule): Promise<boolean> {
  return openDialog<boolean>((done) => <NewSchedule instanceId={instanceId} daemonId={daemonId} task={task} done={done} />);
}
