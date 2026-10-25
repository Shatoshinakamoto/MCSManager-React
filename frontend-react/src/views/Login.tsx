/**
 * Login page: skeleton dashboard behind a blurred overlay hosting the /login
 * layout (port of views/Login.vue). Phones get the bare LoginCard.
 */
import { Col, Row, Skeleton } from "antd";
import CardPanel from "@/components/CardPanel";
import { useScreen } from "@/hooks/useScreen";
import LoginCard from "@/widgets/LoginCard";
import LayoutContainer from "./LayoutContainer";
import "./Login.scss";

export const SKELETONS = [
  { span: 6, rows: 4 }, { span: 6, rows: 4 }, { span: 6, rows: 4 }, { span: 6, rows: 4 },
  { span: 24, rows: 9 }, { span: 8, rows: 6 }, { span: 16, rows: 6 }, { span: 8, rows: 6 }, { span: 16, rows: 6 }
];

export function SkeletonBackdrop() {
  return (
    <div className="main-layout-container">
      <Row gutter={[24, 24]}>
        {SKELETONS.map((s, i) => (
          <Col key={i} span={s.span}>
            <CardPanel>
              <Skeleton paragraph={{ rows: s.rows }} />
            </CardPanel>
          </Col>
        ))}
      </Row>
    </div>
  );
}

export default function Login() {
  const { isPhone } = useScreen();
  if (isPhone) return <LoginCard />;
  return (
    <div>
      <SkeletonBackdrop />
      <div className="login-page-container">
        <div className="login-page-body">
          <LayoutContainer page="/login" />
        </div>
      </div>
    </div>
  );
}
