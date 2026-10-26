/**
 * Music player card with a waveform (port of widgets/others/MusicCard.vue),
 * using wavesurfer.js 7 like upstream.
 *
 * SECURITY: the track URL must be http(s) or a same-origin path; uploads go
 * through the panel's audio allow-list (upload_assets).
 */
import { PauseCircleOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { Button, Empty, Space } from "antd";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import { useEffect, useId, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import CardPanel from "@/components/CardPanel";
import { AUDIO_ACCEPT, openUploadFileDialog } from "@/components/fc/UploadFileDialog";
import type { WidgetProps } from "@/config/widgets";
import { useLayoutCardTools } from "@/hooks/useCardTools";
import { t } from "@/lang/i18n";
import { useAppTools } from "@/stores/appTools";
import { message } from "@/tools/antdStatic";
import { safeHttpUrl } from "@/tools/safeUrl";
import { reportErrorMsg } from "@/tools/validator";
import "./MusicCard.scss";

dayjs.extend(duration);

const formatTime = (s = 0) => {
  const d = dayjs.duration(s, "seconds");
  return d.asHours() >= 1 ? d.format("H:mm:ss") : d.format("m:ss");
};

const isDark = () => document.body.classList.contains("app-dark-theme");

export default function MusicCard({ card }: WidgetProps) {
  const { getMetaValue, setMetaValue } = useLayoutCardTools(card);
  const openInputDialog = useAppTools((s) => s.openInputDialog);
  const [musicUrl, setMusicUrl] = useState(getMetaValue("musicUrl", ""));
  const [playing, setPlaying] = useState(false);
  const [playTime, setPlayTime] = useState("0:00");
  const [maxTime, setMaxTime] = useState("0:00");
  const container = useRef<HTMLDivElement>(null);
  const wave = useRef<WaveSurfer | null>(null);
  const timeLineId = `timeline-${useId().replace(/:/g, "")}`;
  const src = safeHttpUrl(musicUrl);

  useEffect(() => {
    if (!src || !container.current) return;
    const ws = WaveSurfer.create({
      container: container.current,
      waveColor: isDark() ? "#707070" : "#7a7a7a",
      progressColor: isDark() ? "#bababa" : "#000",
      cursorColor: "#8f8f8f",
      url: src,
      height: 50,
      barWidth: 4,
      barGap: 6,
      barRadius: 8,
      cursorWidth: 2
    });
    wave.current = ws;
    ws.on("ready", () => setMaxTime(formatTime(ws.getDuration())));
    ws.on("click", () => {
      void ws.play();
      setPlaying(true);
    });
    ws.on("pause", () => setPlaying(false));
    // Upstream restarts playback when a track ends.
    ws.on("finish", () => {
      void ws.play();
      setPlaying(true);
    });
    ws.on("timeupdate", (time) => setPlayTime(formatTime(time)));
    return () => {
      ws.destroy();
      wave.current = null;
    };
  }, [src]);

  const toggle = () => {
    const ws = wave.current;
    if (!ws) return;
    if (playing) ws.pause();
    else void ws.play();
    setPlaying(!playing);
  };

  const save = (url: string) => {
    setMusicUrl(url);
    setMetaValue("musicUrl", url);
    message.success(t("TXT_CODE_9d498b20"));
  };

  const uploadFile = async () => {
    const path = await openUploadFileDialog(AUDIO_ACCEPT);
    if (path) save(path);
  };

  const fromUrl = async () => {
    try {
      const url = (await openInputDialog(t("TXT_CODE_f4617d31"))).trim();
      if (!url) return;
      if (!safeHttpUrl(url)) return reportErrorMsg(t("TXT_CODE_SAFE_URL_ONLY"));
      save(url);
    } catch {
      // cancelled
    }
  };

  return (
    <div className="MusicCard h-100 position-relative">
      <CardPanel
        title={card.title}
        bodyDesign={
          <Space align="center" orientation="vertical" className="w-100 h-100 edit">
            <h2>{t("TXT_CODE_c2697552")}</h2>
            <Space>
              <Button type="primary" onClick={() => void uploadFile()}>
                {t("TXT_CODE_a106108c")}
              </Button>
              <Button type="primary" onClick={() => void fromUrl()}>
                {t("TXT_CODE_b3f2ea10")}
              </Button>
            </Space>
          </Space>
        }
      >
        {src ? (
          <div className="h-100 flex-center">
            <div className="player">
              <div className="time-line">
                <div id={timeLineId} ref={container} className="time" />
              </div>
              <div className="button">
                <Button
                  type="link"
                  size="large"
                  shape="circle"
                  icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                  style={{ width: "auto", height: "auto", fontSize: 14 }}
                  onClick={toggle}
                />
                <span>
                  {playTime}&nbsp;/&nbsp;{maxTime}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div>
            <Empty
              className="h-100"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <>
                  <span>{t("TXT_CODE_28ce635a")}</span>
                  <br />
                  <span>{t("TXT_CODE_be1354f5")}</span>
                </>
              }
            />
          </div>
        )}
      </CardPanel>
    </div>
  );
}
