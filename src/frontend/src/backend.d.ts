import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export class ExternalBlob {
    getBytes(): Promise<Uint8Array<ArrayBuffer>>;
    getDirectURL(): string;
    static fromURL(url: string): ExternalBlob;
    static fromBytes(blob: Uint8Array<ArrayBuffer>): ExternalBlob;
    withUploadProgress(onProgress: (percentage: number) => void): ExternalBlob;
}
export interface MediaItem {
    id: string;
    metadata: MediaMetadata;
    blob: ExternalBlob;
}
export interface MediaMetadata {
    title: string;
    size: bigint;
    tags: Array<string>;
    description: string;
    fileName: string;
    fileType: string;
    uploadDate: string;
}
export interface DeviceStatus {
    batteryLevel: bigint;
    storageUsed: bigint;
    lastUpdate: string;
    storageTotal: bigint;
    systemHealth: string;
}
export interface backendInterface {
    addMediaItem(id: string, file: ExternalBlob, metadata: MediaMetadata): Promise<void>;
    addNetwork(ssid: string, password: string, encryption: string, signalStrength: string): Promise<void>;
    bulkAddMediaItems(items: Array<[string, ExternalBlob, MediaMetadata]>): Promise<void>;
    clearMediaLibrary(): Promise<void>;
    deleteMediaItem(id: string): Promise<void>;
    deleteNetwork(ssid: string): Promise<void>;
    getAllMediaItemsSortedByFileName(): Promise<Array<MediaItem>>;
    getDeviceStatus(): Promise<DeviceStatus | null>;
    initiateLiveStream(streamId: string, quality: string, targetDevices: Array<string>): Promise<{
        __kind__: "success";
        success: string;
    }>;
    searchMediaByTag(tag: string): Promise<Array<MediaItem>>;
    setDeviceStatus(storageUsed: bigint, storageTotal: bigint, batteryLevel: bigint, systemHealth: string, lastUpdate: string): Promise<void>;
    shareMediaItemWithDevice(mediaId: string, targetDevice: string): Promise<{
        __kind__: "success";
        success: string;
    }>;
    updateMediaMetadata(id: string, newMetadata: MediaMetadata): Promise<void>;
    updateNetwork(ssid: string, password: string, encryption: string, signalStrength: string): Promise<void>;
}
