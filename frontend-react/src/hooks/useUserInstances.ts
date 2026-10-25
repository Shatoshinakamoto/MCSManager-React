/** Load the signed-in user's instances once on mount (upstream: userInfoApi with advanced: true). */
import { useEffect, useState } from "react";
import { userInfoAdvanced } from "@/services/apis";
import { reportErrorMsg } from "@/tools/validator";
import type { LoginUserInfo } from "@/types";

export function useUserInstances() {
  const [state, setState] = useState<LoginUserInfo>();
  useEffect(() => {
    let alive = true;
    userInfoAdvanced({ params: { advanced: true } })
      .then((res) => alive && setState(res))
      .catch(reportErrorMsg);
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
