"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, Loader2, AlertCircle } from "lucide-react";
import { createJobFromDocument } from "@/app/actions/upload";

export default function UploadPage() {
  const router = useRouter();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>("");

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const pdfFile = files.find((f) => f.type === "application/pdf");

    if (!pdfFile) {
      setError("Please upload a PDF file");
      return;
    }

    await processFile(pdfFile);
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      setError("Please upload a PDF file");
      return;
    }

    await processFile(file);
  };

  const processFile = async (file: File) => {
    setIsUploading(true);
    setError(null);
    setUploadProgress("Uploading document...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      setUploadProgress("Processing document with AI...");
      const result = await createJobFromDocument(formData);

      setUploadProgress("Job created! Redirecting...");
      router.push(`/jobs/${result.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setIsUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">
          Upload Insurance Document
        </h1>
        <p className="mt-2 text-gray-600">
          Upload an insurance scope PDF to automatically create a job and extract all details
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-red-50 p-4 text-red-600">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
          isDragging
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 hover:border-gray-400"
        } ${isUploading ? "pointer-events-none opacity-60" : ""}`}
      >
        {isUploading ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600" />
            <p className="text-lg font-medium text-gray-900">{uploadProgress}</p>
            <p className="text-sm text-gray-500">
              This may take a moment while we analyze the document...
            </p>
          </div>
        ) : (
          <>
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-4 text-lg font-medium text-gray-900">
              Drag and drop your insurance scope PDF
            </p>
            <p className="mt-2 text-gray-500">or</p>
            <label className="mt-4 inline-block cursor-pointer rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700">
              Browse Files
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
            <p className="mt-4 text-sm text-gray-500">
              Supported: State Farm, Allstate, Farmers, USAA, and more
            </p>
          </>
        )}
      </div>

      <div className="mt-8 rounded-xl border bg-white p-6">
        <h2 className="mb-4 font-semibold text-gray-900">What happens next?</h2>
        <div className="space-y-3 text-sm text-gray-600">
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-600">
              1
            </div>
            <p>
              <strong>AI extracts all data</strong> — Customer info, property address,
              insurance details, line items, pipe jacks, vents, and materials
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-600">
              2
            </div>
            <p>
              <strong>Job is created automatically</strong> — All extracted data is
              organized into a new job record
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-600">
              3
            </div>
            <p>
              <strong>Review and refine</strong> — Verify the extracted data, add
              aerial reports, generate estimates
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
