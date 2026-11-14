import { useState } from 'react';
import { moveBlock } from './layoutModel';

// Kéo thả khối thân văn bản (HTML5 drag-and-drop), dùng chung cho canvas và danh sách bên trái.
// Thả ở nửa trên một khối = chèn trước khối đó, nửa dưới = chèn sau. Đoạn mở đầu không kéo được
// và không gì chen lên trước nó (moveBlock tự chặn).
const useBlockDrag = (body, onMove) => {
    const [dragId, setDragId] = useState(null);
    const [beforeId, setBeforeId] = useState(undefined);

    const reset = () => { setDragId(null); setBeforeId(undefined); };

    const itemProps = (block, index) => ({
        draggable: block.kind !== 'opening',
        onDragStart: (e) => {
            if (block.kind === 'opening') return;
            e.stopPropagation();
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', block.id);
            setDragId(block.id);
        },
        onDragOver: (e) => {
            if (!dragId) return;
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            const after = block.kind === 'opening' || e.clientY > rect.top + rect.height / 2;
            setBeforeId(after ? (body[index + 1]?.id ?? null) : block.id);
        },
        onDrop: (e) => {
            e.preventDefault();
            if (dragId && beforeId !== undefined) onMove(dragId, beforeId);
            reset();
        },
        onDragEnd: reset,
    });

    /** Có vạch chèn ngay trước khối `id` (null = cuối thân) không — chỉ khi thả ở đó thật sự đổi thứ tự. */
    const showsIndicator = (id) => Boolean(dragId) && beforeId === id && moveBlock(body, dragId, id) !== body;

    return { dragId, itemProps, showsIndicator };
};

export default useBlockDrag;
