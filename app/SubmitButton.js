'use client';

import { useFormStatus } from 'react-dom';

/** 제출 중에는 비활성화되고 문구가 바뀌는 버튼 */
export default function SubmitButton({ children, pendingText = '처리 중…', className = 'btn primary', ...rest }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} {...rest}>
      {pending ? pendingText : children}
    </button>
  );
}
