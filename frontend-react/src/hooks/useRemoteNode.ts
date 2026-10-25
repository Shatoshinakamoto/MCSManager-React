/** Node add/edit/delete actions (port of upstream hooks/useRemoteNode.ts). */
import { useOverviewStore } from "@/hooks/useOverviewInfo";
import { addNode as addNodeApi, connectNode, deleteNode as deleteNodeApi, editNode } from "@/services/apis/node";

const refresh = () => useOverviewStore.getState().refresh(true);

export async function addNode(data: Record<string, unknown>) {
  await addNodeApi({ data });
  await refresh();
}

export async function deleteNode(uuid: string) {
  await deleteNodeApi({ params: { uuid } });
  await refresh();
}

export async function updateNode(uuid: string, data: Record<string, unknown>) {
  await editNode({ params: { uuid }, data });
  await connectNode({ params: { uuid } });
  await refresh();
}
