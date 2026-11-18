import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BrainCircuit, AlertTriangle } from 'lucide-react';
import { getBackgroundJob } from '../../service/minutesServices';

const AiGeneratorProgress = ({ jobId, onComplete, onError }) => {
    const [status, setStatus] = useState('queued'); // queued, scheduled, running, completed, failed
    const [errorMessage, setErrorMessage] = useState('');
    const [progressText, setProgressText] = useState('Đang khởi tạo luồng phân tích AI...');

    // Progress text rotation
    useEffect(() => {
        if (status === 'completed' || status === 'failed') return;
        
        const texts = [
            'Đang đọc và phân tích nội dung cuộc họp...',
            'Đang nhận diện các quyết định quan trọng (Decisions)...',
            'Đang trích xuất công việc cần làm (Action Items)...',
            'Đang tổng hợp thông tin (Key Points & Risks)...',
            'Sắp hoàn tất bản tóm tắt...'
        ];
        
        let i = 0;
        const interval = setInterval(() => {
            i = (i + 1) % texts.length;
            setProgressText(texts[i]);
        }, 5000); // Đổi text sau mỗi 5s
        
        return () => clearInterval(interval);
    }, [status]);

    // Polling logic
    useEffect(() => {
        if (!jobId) return;

        let cancelled = false;
        let timeoutId;
        const checkStatus = async () => {
            try {
                const res = await getBackgroundJob(jobId);
                if (cancelled) return;
                if (res?.success) {
                    const job = res.data;
                    setStatus(job.status);

                    if (job.status === 'completed') {
                        // Gọi callback để tab cha tự load lại minutes
                        if (onComplete) onComplete(job.result?.minutesId);
                    } else if (job.status === 'failed') {
                        let errorVi = 'Không thể kết nối tới mô hình AI.';
                        if (job.errorMessage === 'LLM_UNAVAILABLE') errorVi = 'Mô hình AI hiện không khả dụng hoặc bị quá tải. Vui lòng thử lại sau.';
                        else if (job.errorMessage === 'AI_OUTPUT_INVALID_SCHEMA') errorVi = 'Mô hình AI trả về kết quả không đúng cấu trúc biên bản chuẩn. Đã hủy xử lý.';
                        else if (job.errorMessage === 'TRANSCRIPT_TOO_LONG_FOR_MVP') errorVi = 'Độ dài biên bản cuộc họp vượt quá giới hạn xử lý của AI trong phiên bản này.';
                        else if (job.errorMessage) errorVi = `Lỗi hệ thống: ${job.errorMessage}`;

                        setErrorMessage(errorVi);
                        if (onError) onError(errorVi);
                    } else {
                        // Tiếp tục poll
                        timeoutId = setTimeout(checkStatus, 3000);
                    }
                } else {
                    timeoutId = setTimeout(checkStatus, 3000);
                }
            } catch (err) {
                // Network error -> keep polling
                if (!cancelled) timeoutId = setTimeout(checkStatus, 3000);
            }
        };

        checkStatus();

        return () => {
            cancelled = true;
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [jobId, onComplete, onError]);

    if (status === 'failed') {
        return (
            <div className="bg-white rounded-3xl border border-red-200 shadow-sm p-8 text-center text-red-600">
                <AlertTriangle className="w-10 h-10 mx-auto mb-3" />
                <h3 className="text-sm font-bold uppercase mb-2">Tạo biên bản thất bại</h3>
                <p className="text-xs">{errorMessage}</p>
                {/* Nút thử lại sẽ được xử lý ở component cha bằng cách gọi lại API tạo job */}
            </div>
        );
    }

    return (
        <div className="bg-white rounded-3xl border border-platinum-tint shadow-sm-2 p-8 text-center space-y-6">
            <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                    className="absolute inset-0 border-[3px] border-dashed border-purple-300 rounded-full"
                />
                <motion.div 
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="w-14 h-14 bg-purple-50 rounded-full flex items-center justify-center shadow-inner relative z-10"
                >
                    <BrainCircuit className="w-6 h-6 text-purple-600" />
                </motion.div>
            </div>
            
            <div>
                <h3 className="text-sm font-bold text-midnight-indigo uppercase tracking-wider mb-2">AI Summarize đang xử lý</h3>
                <motion.p 
                    key={progressText}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xs text-slate-blue max-w-sm mx-auto font-medium"
                >
                    {progressText}
                </motion.p>
                <p data-ui-text="secondary" className="text-[10px] text-slate-blue/60 mt-2 italic">(Quá trình này có thể mất từ 30-100 giây tùy thuộc vào độ dài cuộc họp)</p>
            </div>

            {/* Skeleton blocks để giả lập text đang được gõ ra */}
            <div className="max-w-xl mx-auto space-y-4 pt-4 border-t border-platinum-tint/50 text-left">
                <div className="space-y-2">
                    <div className="h-3 bg-purple-100/50 rounded animate-pulse w-3/4"></div>
                    <div className="h-3 bg-purple-100/50 rounded animate-pulse w-5/6" style={{ animationDelay: '150ms' }}></div>
                    <div className="h-3 bg-purple-100/50 rounded animate-pulse w-2/3" style={{ animationDelay: '300ms' }}></div>
                </div>
                
                <div className="flex gap-4">
                    <div className="h-16 flex-1 bg-cloud-mist/40 rounded-xl animate-pulse" style={{ animationDelay: '450ms' }}></div>
                    <div className="h-16 flex-1 bg-cloud-mist/40 rounded-xl animate-pulse" style={{ animationDelay: '600ms' }}></div>
                </div>
            </div>
        </div>
    );
};

export default AiGeneratorProgress;
