/**
 * Docker image / network endpoints on a daemon (port of upstream services/apis/envImage.ts).
 * Same URLs, methods and payloads; the panel and daemon enforce authorization.
 */
import { defineApi } from "@/services/apiService";
import type { ContainerInfo, DockerNetworkModes, ImageInfo } from "@/types/docker";

export const imageList = defineApi<
  {
    params: {
      daemonId: string;
      imageId?: string;
    };
    data?: {
      dockerFile: string;
      name: string;
      tag: string;
    };
    method: string;
  },
  ImageInfo[]
>({
  url: "/api/environment/image"
});

export const getNetworkModeList = defineApi<
  {
    params: {
      daemonId: string;
    };
  },
  DockerNetworkModes[]
>({
  url: "/api/environment/networkModes",
  method: "GET"
});

export const containerList = defineApi<
  {
    params: {
      daemonId: string;
      imageId?: string;
    };
  },
  ContainerInfo[]
>({
  url: "/api/environment/containers",
  method: "GET"
});

export const buildProgress = defineApi<
  {
    params: {
      daemonId: string;
    };
  },
  {
    [propsName: string]: number;
  }
>({
  url: "/api/environment/progress",
  method: "GET"
});

export const getImagePlatforms = defineApi<
  {
    params: {
      daemonId: string;
    };
    data: {
      imageName: string;
    };
  },
  string[]
>({
  url: "/api/environment/image_platforms",
  method: "POST"
});

export const getDockerHubImagePlatforms = defineApi<
  {
    data: {
      imageName: string;
    };
  },
  string[]
>({
  url: "/api/environment/dockerhub_image_platforms",
  method: "POST"
});
