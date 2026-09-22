import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import './index.css';
import App from './App';

// antd 的 ConfigProvider locale 只管组件内置文案，dayjs 的星期/月份是独立的一套。
// 不设这一行，界面上会出现「2026年9月22日 Tuesday」这类中英混排。
dayjs.locale('zh-cn');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
