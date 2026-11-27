/** A kept room setting image on a product. The first item is the one decks and tearsheets use. */
export interface RoomImage {
  url: string;
  path: string;
  roomType: string;
  size: string;
  at: string;
  by: string;
  sourceUrl: string;
}

export function firstRoomImage(p: { roomImages?: RoomImage[] | null }): RoomImage | null {
  const list = p.roomImages;
  return Array.isArray(list) && list.length > 0 && list[0]?.url ? list[0] : null;
}
