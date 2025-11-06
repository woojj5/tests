'use client';

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

type PcaFullData = {
  version: number;
  max_components: number;
  n_samples: number;
  components: number[][];
  explained_variance_ratio: number[];
  explained_variance_cumsum: number[];
  devices: string[];
  car_types: (string | null)[];
};

type PcaContextType = {
  data: PcaFullData | null;
  loading: boolean;
  error: string | null;
};

const PcaContext = createContext<PcaContextType>({
  data: null,
  loading: true,
  error: null,
});

// 전역 fetch Promise (중복 요청 방지)
let globalFetchPromise: Promise<PcaFullData | null> | null = null;
let globalData: PcaFullData | null = null;
let globalLoading = true;
let globalError: string | null = null;

// 전역 상태 업데이트 함수들
const subscribers = new Set<(state: PcaContextType) => void>();

function notifySubscribers() {
  const state: PcaContextType = {
    data: globalData,
    loading: globalLoading,
    error: globalError,
  };
  subscribers.forEach((fn) => fn(state));
}

function setGlobalData(data: PcaFullData | null) {
  globalData = data;
  globalLoading = false;
  notifySubscribers();
}

function setGlobalError(error: string | null) {
  globalError = error;
  globalLoading = false;
  notifySubscribers();
}

/**
 * PCA 데이터를 한 번만 fetch하는 함수
 */
async function fetchPcaFull(): Promise<PcaFullData | null> {
  // 이미 로드된 데이터가 있으면 반환
  if (globalData) {
    return globalData;
  }

  // 이미 진행 중인 요청이 있으면 기다림
  if (globalFetchPromise) {
    return globalFetchPromise;
  }

  // 새로운 요청 시작
  globalFetchPromise = (async () => {
    try {
      const res = await fetch('/api/pca/full', {
        cache: 'force-cache',
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to load PCA data: ${res.status} ${errorText}`);
      }

      const data = await res.json() as PcaFullData;
      
      // 전역 상태 업데이트
      setGlobalData(data);
      globalFetchPromise = null; // 완료 후 초기화
      
      return data;
    } catch (e: any) {
      const error = e.message || 'Failed to load PCA data';
      setGlobalError(error);
      globalFetchPromise = null; // 에러 후 초기화
      return null;
    }
  })();

  return globalFetchPromise;
}

/**
 * PCA Context Provider
 * 앱 전체에서 PCA 데이터를 한 번만 로드하고 공유
 */
export function PcaProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PcaContextType>({
    data: globalData,
    loading: globalLoading,
    error: globalError,
  });

  useEffect(() => {
    // 구독 등록
    const subscriber = (newState: PcaContextType) => {
      setState(newState);
    };
    subscribers.add(subscriber);

    // 초기 로드 (이미 로드된 데이터가 없을 때만)
    if (!globalData && !globalFetchPromise) {
      fetchPcaFull();
    }

    // 구독 해제
    return () => {
      subscribers.delete(subscriber);
    };
  }, []); // 마운트 시 한 번만 실행

  return <PcaContext.Provider value={state}>{children}</PcaContext.Provider>;
}

/**
 * PCA Context Hook
 */
export function usePcaData() {
  return useContext(PcaContext);
}

