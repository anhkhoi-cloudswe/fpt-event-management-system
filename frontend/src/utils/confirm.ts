// Centralized confirm helper and standard messages
export const CONFIRM_MESSAGES = {
  disableEvent: 'Bạn có chắc chắn muốn vô hiệu hóa (đóng) sự kiện này?',
  deleteVenue: 'Bạn có chắc chắn muốn xóa địa điểm này?',
  deleteArea: 'Bạn có chắc chắn muốn xóa phòng này?',
}

export function confirmDialog(message: string): boolean {
  // Currently uses native confirm to keep behavior simple.
  // Centralized here so we can replace with a custom modal later.
  return window.confirm(message)
}
