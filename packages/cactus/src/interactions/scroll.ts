export function stopWheelIfScrollable(event: WheelEvent & { currentTarget: HTMLElement }): void {
  if (event.ctrlKey) return; // Modified wheel belongs to canvas zoom, not text scrolling.
  const element = event.currentTarget;
  const canScrollVertically = element.scrollHeight > element.clientHeight + 1;
  const canScrollHorizontally = element.scrollWidth > element.clientWidth + 1;
  const canScrollY = event.deltaY < 0 ? element.scrollTop > 0
    : event.deltaY > 0 ? element.scrollTop + element.clientHeight < element.scrollHeight - 1 : false;
  const canScrollX = event.deltaX < 0 ? element.scrollLeft > 0
    : event.deltaX > 0 ? element.scrollLeft + element.clientWidth < element.scrollWidth - 1 : false;
  if ((canScrollVertically && canScrollY) || (canScrollHorizontally && canScrollX)) event.stopPropagation();
}

