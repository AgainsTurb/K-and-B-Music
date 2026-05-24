// src/services/cloud.ts
import { invoke } from '@tauri-apps/api/core';

export interface SyncConfig {
  groupId: string | null;
  deviceId: string | null;
}

export function getSyncConfig(): SyncConfig {
  return {
    groupId: localStorage.getItem('sync_group_id'),
    deviceId: localStorage.getItem('sync_device_id')
  };
}

export function saveSyncConfig(groupId: string, deviceId: string) {
  localStorage.setItem('sync_group_id', groupId);
  localStorage.setItem('sync_device_id', deviceId)
}

export function clearSyncGroup() {
  localStorage.removeItem('sync_group_id');
}

export async function getLocalDeviceId(): Promise<string> {
  let id = localStorage.getItem('sync_device_id');
  if (!id) {
    id = await invoke<string>('get_device_id');
    localStorage.setItem('sync_device_id', id);
  }
  return id;
}

export async function createSyncGroup(): Promise<{groupId: string, pin: string}> {
  const [groupId, pin] = await invoke<[string, string]>('create_sync_group');
  return { groupId, pin };
}

export async function joinSyncGroup(pin: string): Promise<string> {
  return await invoke<string>('join_sync_group', { pin });
}

export async function triggerCloudSync(groupId: string, deviceId: string): Promise<string> {
  return await invoke<string>('trigger_cloud_sync', { groupId, deviceId });
}

export async function leaveSyncGroup(groupId: string): Promise<void> {
  await invoke('leave_sync_group', { groupId });
}

export async function getGroupPin(groupId: string): Promise<string> {
  return await invoke<string>('get_group_pin', { groupId });
}