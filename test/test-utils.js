import React from "react";
import ReactDOM from "react-dom/client";
import { act } from "@testing-library/react";

// Custom renderHook that manages the React root directly, bypassing RTL's
// render/rerender. This is necessary because:
// 1. RTL auto-cleanup unmounts roots between it() blocks via afterEach,
//    breaking tests that create `rendered` in beforeAll and reuse across tests.
// 2. React 19 throws "Cannot update an unmounted root" when rerender is called
//    on a root that RTL's cleanup already unmounted.
export function renderHook(callback, options) {
  const { initialProps, wrapper: Wrapper } = options || {};
  const result = { current: null, all: [] };

  function TestComponent({ renderCallbackProps }) {
    const pendingResult = callback(renderCallbackProps);
    result.current = pendingResult;
    result.all.push(pendingResult);
    return null;
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);

  function renderUI(props) {
    let element = React.createElement(TestComponent, { renderCallbackProps: props });
    if (Wrapper) {
      element = React.createElement(Wrapper, null, element);
    }
    act(() => {
      root.render(element);
    });
  }

  renderUI(initialProps);

  function rerender(rerenderCallbackProps) {
    renderUI(rerenderCallbackProps);
  }

  function unmount() {
    act(() => {
      root.unmount();
    });
    container.remove();
  }

  return { result, rerender, unmount };
}
