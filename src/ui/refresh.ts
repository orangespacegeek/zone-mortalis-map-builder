let refreshHandler: () => void = () => {};

export function setRefresher(handler: () => void): void {
  refreshHandler = handler;
}

export function requestRefresh(): void {
  refreshHandler();
}
