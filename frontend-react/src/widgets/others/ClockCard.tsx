/** Clock card with two styles (port of widgets/others/ClockCard.vue and components/time/Style1/2.vue). */
import { UndoOutlined } from "@ant-design/icons";
import { Button, Tooltip } from "antd";
import dayjs from "dayjs";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import CardPanel from "@/components/CardPanel";
import type { WidgetProps } from "@/config/widgets";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { t } from "@/lang/i18n";
import "./ClockCard.scss";

const getTime = () => dayjs().format("HH:mm:ss");
const getDate = () => dayjs().format("YYYY/MM/DD dddd");

function Style1({ time, date }: { time: string; date: string }) {
  return (
    <div className="h-100 flex-center">
      <div className="value pb-40" style={{ fontSize: 60 }}>
        {time}
      </div>
      <div className="ml-auto" style={{ fontSize: 10, position: "absolute", right: 40, bottom: 20 }}>
        {date}
      </div>
    </div>
  );
}

const digits = (n: number, cls?: string) => Array.from({ length: n }, (_, i) => <span key={i} className={cls}>{i}</span>);

function Style2({ date }: { time?: string; date: string }) {
  const [time, setTime] = useState("");
  const [st, setSt] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setTime(dayjs().format("HHmmss"));
      setSt(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  const n = (i: number) => ({ "--n": Number(time[i] ?? 0) }) as CSSProperties;
  return (
    <>
      <div className="time-wrapper h-100 flex-center overflow-hidden">
        <div className="time mb-40">
          <div className="time-container">
            <div className="h">
              <div className="left" style={n(0)}>{digits(3)}</div>
              <div className="right" style={n(1)}>{digits(10)}</div>
            </div>
            :
            <div className="m">
              <div className="left" style={n(2)}>{digits(7)}</div>
              <div className="right" style={n(3)}>{digits(10)}</div>
            </div>
            :
            <div className="s">
              <div className="left" style={n(4)}>{digits(7, "second-item")}</div>
              <div className="right" style={n(5)}>{digits(10, "second-item")}</div>
            </div>
          </div>
          <div className="flex-center mt-12 date">
            <div>
              <div className="flex-center">
                <span>Timestamp: {st}</span>
              </div>
              <div className="flex-center">{date}</div>
            </div>
          </div>
        </div>
      </div>
      <div>{date}</div>
    </>
  );
}

const STYLES = [Style1, Style2];

export default function ClockCard({ card }: WidgetProps) {
  const { getMetaValue, setMetaValue } = useLayoutCardTools(card);
  const [style, setStyle] = useState<number>(Number(getMetaValue("style", 2)) || 2);
  const [spinning, setSpinning] = useState(false);
  const [time, setTime] = useState(getTime());
  const spinTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const date = getDate();

  useEffect(() => {
    const timer = setInterval(() => setTime(getTime()), 1000);
    return () => {
      clearInterval(timer);
      if (spinTimer.current) clearTimeout(spinTimer.current);
    };
  }, []);

  const changeStyle = () => {
    setSpinning(true);
    if (!spinTimer.current) {
      spinTimer.current = setTimeout(() => {
        setSpinning(false);
        spinTimer.current = null;
      }, 1050);
    }
    const next = style === STYLES.length ? 1 : style + 1;
    setStyle(next);
    setMetaValue("style", next);
  };

  const View = STYLES[style - 1] ?? Style2;
  return (
    <div className="ClockCard h-100">
      <CardPanel
        title={card.title}
        operatorDesign={
          <Button
            type="link"
            size="small"
            className="ml-10"
            onClick={changeStyle}
            icon={
              <Tooltip placement="top" title={<span>{t("TXT_CODE_5ab1eb7d")}</span>}>
                <UndoOutlined rotate={45} spin={spinning} />
              </Tooltip>
            }
          />
        }
      >
        <View time={time} date={date} />
      </CardPanel>
    </div>
  );
}
