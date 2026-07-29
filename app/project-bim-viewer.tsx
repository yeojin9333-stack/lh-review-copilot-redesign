"use client";

import { useEffect, useRef, useState } from "react";
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchContentRef,
} from "react-zoom-pan-pinch";

const CUTAWAY_ASSET = "/assets/project-overview-cutaway.webp";
const RAMP_FOCUS_ID = "project-ramp-focus";

function ViewerControls({
  controls,
}: {
  controls: ReactZoomPanPinchContentRef;
}) {
  return (
    <div className="cutaway-controls" aria-label="전체 프로젝트 화면 조작">
      <button
        aria-label="확대"
        onClick={() => controls.zoomIn(0.35, 220)}
        title="확대"
        type="button"
      >
        +
      </button>
      <button
        aria-label="축소"
        onClick={() => controls.zoomOut(0.35, 220)}
        title="축소"
        type="button"
      >
        −
      </button>
      <button
        onClick={() => controls.resetTransform(320)}
        title="전체 단지를 화면에 맞춤"
        type="button"
      >
        전체 보기
      </button>
      <button
        onClick={() => controls.zoomToElement(RAMP_FOCUS_ID, 2.25, 420, "easeOut")}
        title="곡선형 램프 위치 확대"
        type="button"
      >
        램프 상세 보기
      </button>
    </div>
  );
}

export function ProjectBimViewer({
  selected,
  onSelect,
}: {
  selected: boolean;
  onSelect: () => void;
}) {
  const [imageReady, setImageReady] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (imageRef.current?.complete && imageRef.current.naturalWidth > 0) {
      setImageReady(true);
    }
  }, []);

  return (
    <section className={`project-bim-viewer ${selected ? "is-selected" : ""}`}>
      <div className="project-bim-toolbar">
        <div className="project-bim-depth" aria-label="BIM 공간 단계">
          <span className="active">단지 전체</span>
          <i>→</i>
          <span className={selected ? "active" : ""}>지하주차장 B1</span>
          <i>→</i>
          <span className={selected ? "active" : ""}>곡선형 램프 R-02</span>
        </div>
        <span>드래그 이동 · 휠 확대 · 더블클릭 확대 · 터치 Pinch Zoom</span>
      </div>

      <TransformWrapper
        centerOnInit
        centerZoomedOut
        doubleClick={{ mode: "zoomIn", step: 0.7 }}
        initialScale={1}
        limitToBounds
        maxScale={4}
        minScale={1}
        panning={{ velocityDisabled: false }}
        pinch={{ step: 5 }}
        wheel={{ step: 0.12 }}
      >
        {(controls) => (
          <div className="project-bim-stage" aria-label="A-17BL 공동주택 단지 Cutaway">
            {!imageReady && (
              <div className="project-bim-loading">
                <i />
                전체 설계 모델을 불러오고 있습니다.
              </div>
            )}

            <TransformComponent
              contentStyle={{ height: "auto", width: "100%" }}
              wrapperStyle={{ height: "100%", width: "100%" }}
            >
              <div className="cutaway-transform-scene">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt="지상 공동주택 단지와 지하주차장, 곡선형 램프가 함께 보이는 시연용 Cutaway"
                  className={imageReady ? "is-ready" : ""}
                  draggable={false}
                  onLoad={() => setImageReady(true)}
                  ref={imageRef}
                  src={CUTAWAY_ASSET}
                />
                <div
                  aria-hidden="true"
                  className={`ramp-highlight ${selected ? "is-selected" : ""}`}
                  id={RAMP_FOCUS_ID}
                />
                <button
                  aria-pressed={selected}
                  className="project-ramp-hotspot"
                  onClick={() => {
                    onSelect();
                    controls.zoomToElement(RAMP_FOCUS_ID, 2.25, 420, "easeOut");
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  type="button"
                >
                  <span className="hotspot-pulse" />
                  <span className="hotspot-label">
                    <b>AI 검토 대상</b>
                    <strong>B1 곡선형 램프 R-02</strong>
                    <small>{selected ? "선택됨" : "선택하여 검토 의도 입력"}</small>
                  </span>
                </button>
              </div>
            </TransformComponent>

            <ViewerControls controls={controls} />
            <div className="project-bim-legend">
              <span>
                <i className="site" /> 지상 공동주택 단지
              </span>
              <span>
                <i className="parking" /> 지하주차장 Cutaway
              </span>
              <span>
                <i className="review" /> AI 검토 대상 램프
              </span>
            </div>
          </div>
        )}
      </TransformWrapper>

      <footer className="project-bim-footer">
        <span>전체 프로젝트 BIM</span>
        <small>시연용 단순화 전체 설계 모델 · 실제 IFC 분석 또는 공정 현황이 아닙니다.</small>
      </footer>
    </section>
  );
}
