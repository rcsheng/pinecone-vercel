import React, { ChangeEvent, useCallback, useEffect, useState } from "react";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - types provided via devDependency
import type { ParseResult } from "papaparse";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - types provided via devDependency
import Papa from "papaparse";
import { urls } from "./urls";
import UrlButton from "./UrlButton";
import { Card, ICard } from "./Card";
import { clearIndex, crawlDocument } from "./utils";

import { Button } from "./Button";
interface ContextProps {
  className: string;
  selected: string[] | null;
}

export const Context: React.FC<ContextProps> = ({ className, selected }) => {
  const [entries, setEntries] = useState(urls);
  const [cards, setCards] = useState<ICard[]>([]);

  const [splittingMethod, setSplittingMethod] = useState("markdown");
  const [chunkSize, setChunkSize] = useState(256);
  const [overlap, setOverlap] = useState(1);

   const [mode, setMode] = useState<"crawl" | "analysis">("crawl");

  // Scroll to selected card
  useEffect(() => {
    const element = selected && document.getElementById(selected[0]);
    element?.scrollIntoView({ behavior: "smooth" });
  }, [selected]);

  const DropdownLabel: React.FC<
    React.PropsWithChildren<{ htmlFor: string }>
  > = ({ htmlFor, children }) => (
    <label htmlFor={htmlFor} className="text-white p-2 font-bold">
      {children}
    </label>
  );

  const buttons = entries.map((entry, key) => (
    <div className="" key={`${key}-${entry.loading}`}>
      <UrlButton
        entry={entry}
        onClick={() =>
          crawlDocument(
            entry.url,
            setEntries,
            setCards,
            splittingMethod,
            chunkSize,
            overlap
          )
        }
      />
    </div>
  ));

  return (
    <div
      className={`flex flex-col border-2 overflow-y-auto rounded-lg border-gray-500 w-full ${className}`}
    >
      <div className="flex flex-col items-start sticky top-0 w-full bg-gray-900">
        <div className="flex w-full border-b border-gray-700">
          <button
            className={`flex-1 px-4 py-2 text-sm font-semibold ${
              mode === "crawl"
                ? "bg-gray-800 text-white border-b-2 border-sky-500"
                : "bg-gray-900 text-gray-300 hover:bg-gray-800"
            }`}
            onClick={() => setMode("crawl")}
          >
            Context Seeding
          </button>
          <button
            className={`flex-1 px-4 py-2 text-sm font-semibold ${
              mode === "analysis"
                ? "bg-gray-800 text-white border-b-2 border-sky-500"
                : "bg-gray-900 text-gray-300 hover:bg-gray-800"
            }`}
            onClick={() => setMode("analysis")}
          >
            Analysis Factory
          </button>
        </div>

        {mode === "crawl" && (
          <>
            <div className="flex flex-col items-start lg:flex-row w-full lg:flex-wrap p-2">
              {buttons}
            </div>
            <div className="flex-grow w-full px-4">
              <Button
                className="w-full my-2 uppercase active:scale-[98%] transition-transform duration-100"
                style={{
                  backgroundColor: "#4f6574",
                  color: "white",
                }}
                onClick={() => clearIndex(setEntries, setCards)}
              >
                Clear Index
              </Button>
            </div>
            <div className="flex p-2"></div>
            <div className="text-left w-full flex flex-col rounded-b-lg bg-gray-600 p-3 subpixel-antialiased">
              <DropdownLabel htmlFor="splittingMethod">
                Splitting Method:
              </DropdownLabel>
              <div className="relative w-full">
                <select
                  id="splittingMethod"
                  value={splittingMethod}
                  className="p-2 bg-gray-700 rounded text-white w-full appearance-none hover:cursor-pointer"
                  onChange={(e) => setSplittingMethod(e.target.value)}
                >
                  <option value="recursive">Recursive Text Splitting</option>
                  <option value="markdown">Markdown Splitting</option>
                </select>
              </div>
              {splittingMethod === "recursive" && (
                <div className="my-4 flex flex-col">
                  <div className="flex flex-col w-full">
                    <DropdownLabel htmlFor="chunkSize">
                      Chunk Size: {chunkSize}
                    </DropdownLabel>
                    <input
                      className="p-2 bg-gray-700"
                      type="range"
                      id="chunkSize"
                      min={1}
                      max={2048}
                      onChange={(e) => setChunkSize(parseInt(e.target.value))}
                    />
                  </div>
                  <div className="flex flex-col w-full">
                    <DropdownLabel htmlFor="overlap">
                      Overlap: {overlap}
                    </DropdownLabel>
                    <input
                      className="p-2 bg-gray-700"
                      type="range"
                      id="overlap"
                      min={1}
                      max={200}
                      onChange={(e) => setOverlap(parseInt(e.target.value))}
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {mode === "analysis" && <AnalysisFactory />}
      </div>

      {mode === "crawl" && (
        <div className="flex flex-wrap w-full">
          {cards &&
            cards.map((card, key) => (
              <Card key={key} card={card} selected={selected} />
            ))}
        </div>
      )}
    </div>
  );
};

type SegmentSummary = {
  segment: string;
  count: number;
  totalWeight: number;
  averageWeight: number | null;
};

type UploadRespondent = {
  id: string;
  answer: string;
  weight: number;
  segments: string[];
};

const AnalysisFactory: React.FC = () => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<string[][] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [questionText, setQuestionText] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<SegmentSummary[] | null>(null);
  const [uploadData, setUploadData] = useState<{
    question: string;
    respondents: UploadRespondent[];
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setError(null);
      setFileName(file.name);
      setQuestionText(null);
      setSummaries(null);
      setUploadData(null);
      setUploadStatus(null);

      const reader = new FileReader();
      reader.onload = () => {
        try {
          const text = String(reader.result || "");
          const parsed: ParseResult<string[]> = Papa.parse<string[]>(text, {
            header: false,
            skipEmptyLines: true,
          });

          if (parsed.errors && parsed.errors.length > 0) {
            console.error("CSV parse errors:", parsed.errors);
          }

          const rows = parsed.data;

          if (rows.length < 3) {
            setError("CSV appears to be empty or missing header rows.");
            setPreviewRows(null);
            return;
          }

          setPreviewRows(rows.slice(0, 8));

          const headerRow1 = rows[0] as string[];
          const headerRow2 = rows[1] as string[];

          const findIndex = (row: string[], label: string): number =>
            row.findIndex((cell: string) => {
              if (!cell) return false;
              const normalized = cell.toLowerCase().trim();
              return normalized === label || normalized.includes(label);
            });

          const answerColIdx = findIndex(headerRow1, "answers");
          const weightColIdx = findIndex(headerRow1, "poststrat");

          console.log("answerColIdx", answerColIdx);
          console.log("weightColIdx", weightColIdx);

          if (answerColIdx === -1 || weightColIdx === -1) {
            setError(
              "Could not find 'answers' and 'poststrat' columns in the first header row."
            );
            return;
          }

          // Question text comes from the second header row of the "answers" column
          const qText = (headerRow2[answerColIdx] || "").trim();
          setQuestionText(qText || null);

          const segmentIndices: { index: number; name: string }[] = [];
          headerRow1.forEach((cell, idx) => {
            if (
              cell &&
              cell.toLowerCase().trim() === "segments" &&
              headerRow2[idx]
            ) {
              segmentIndices.push({
                index: idx,
                name: headerRow2[idx],
              });
            }
          });

          const respondentRows = rows.slice(2) as string[][];

          const bySegment = new Map<string, SegmentSummary>();
          const uploadRespondents: UploadRespondent[] = [];

          const ensureSegment = (name: string) => {
            if (!bySegment.has(name)) {
              bySegment.set(name, {
                segment: name,
                count: 0,
                totalWeight: 0,
                averageWeight: null,
              });
            }
            return bySegment.get(name)!;
          };

          const overall = ensureSegment("All respondents");

          respondentRows.forEach((row: string[], rowIdx: number) => {
            const weightRaw = row[weightColIdx];

            if (!weightRaw) {
              return;
            }

            const weight = parseFloat(weightRaw);

            if (!isFinite(weight) || weight <= 0) {
              return;
            }

            // All respondents bucket
            overall.count += 1;
            overall.totalWeight += weight;

            // Segment-level buckets based on membership flags.
            // A respondent belongs to a segment iff the cell under that segment is "TRUE".
            const rowSegments: string[] = [];
            segmentIndices.forEach(({ index, name }) => {
              const membership = row[index];
              if (!membership) return;
              if (membership.toLowerCase().trim() !== "true") return;

              const seg = ensureSegment(name);
              seg.count += 1;
              seg.totalWeight += weight;
              rowSegments.push(name);
            });

            uploadRespondents.push({
              id: String(rowIdx + 3), // original CSV row number (1-based)
              answer: row[answerColIdx],
              weight,
              segments: rowSegments,
            });
          });

          const summaryList = Array.from(bySegment.values()).map((s) => ({
            ...s,
            averageWeight:
              s.count > 0 ? Number((s.totalWeight / s.count).toFixed(3)) : null,
          }));

          setSummaries(summaryList);
          setUploadData(
            qText
              ? {
                  question: qText,
                  respondents: uploadRespondents,
                }
              : null
          );
        } catch (e) {
          console.error("Error parsing CSV:", e);
          setError("Could not parse CSV file. Please check the format.");
          setPreviewRows(null);
          setSummaries(null);
        }
      };
      reader.onerror = () => {
        setError("Failed to read file.");
        setPreviewRows(null);
        setSummaries(null);
      };

      reader.readAsText(file);
    },
    []
  );

  const headers = previewRows && previewRows.length > 0 ? previewRows[0] : null;
  const dataRows =
    previewRows && previewRows.length > 1 ? previewRows.slice(1) : [];

  const handleUploadToPinecone = useCallback(async () => {
    if (!uploadData) return;
    try {
      setUploading(true);
      setUploadStatus(null);

      const total = uploadData.respondents.length;
      const batchSize = 200;
      let uploaded = 0;

      console.log("[AnalysisFactory] Uploading to Pinecone", {
        totalRespondents: total,
        batchSize,
        question: uploadData.question,
      });

      while (uploaded < total) {
        const nextBatch = uploadData.respondents.slice(
          uploaded,
          uploaded + batchSize
        );

        const payload = {
          question: uploadData.question,
          respondents: nextBatch,
        };

        const res = await fetch("/api/analysis", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Upload failed");
        }

        const json = await res.json();
        uploaded += json.upserted ?? nextBatch.length;

        setUploadStatus(
          `Uploaded ${uploaded} of ${total} responses to Pinecone...`
        );
      }

      setUploadStatus(
        `Upload complete: ${uploaded} responses sent to Pinecone.`
      );
    } catch (e: any) {
      console.error("Upload to Pinecone failed:", e);
      setUploadStatus(
        `Upload failed: ${e?.message || "Unknown error occurred."}`
      );
    } finally {
      setUploading(false);
    }
  }, [uploadData]);

  return (
    <div className="w-full p-4 bg-gray-800 text-white">
      <h2 className="text-lg font-semibold mb-2">Analysis Factory</h2>
      <p className="text-sm text-gray-300 mb-4">
        Upload a CSV file containing survey results in the pivot format you
        described (segments in the first header row, labels in the second,
        &apos;answers&apos; and &apos;poststrat&apos; columns). We&apos;ll
        preview the data and compute simple weighted summaries by segment.
      </p>
      <label className="inline-flex items-center justify-center px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-md text-sm font-semibold cursor-pointer">
        Choose CSV file
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileChange}
        />
      </label>
      {fileName && (
        <div className="mt-2 text-xs text-gray-300">Selected: {fileName}</div>
      )}
      {error && (
        <div className="mt-3 text-sm text-red-400">
          {error}
        </div>
      )}
      {headers && (
        <div className="mt-4 overflow-auto border border-gray-700 rounded">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-700">
              <tr>
                {headers.map((h, idx) => (
                  <th
                    key={idx}
                    className="px-2 py-1 text-left font-semibold border-b border-gray-600"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataRows.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  className={rowIdx % 2 === 0 ? "bg-gray-800" : "bg-gray-700"}
                >
                  {row.map((cell, cellIdx) => (
                    <td
                      key={cellIdx}
                      className="px-2 py-1 border-b border-gray-700 whitespace-nowrap"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-2 py-1 text-[10px] text-gray-400">
            Showing up to 7 rows from your CSV for quick verification.
          </div>
        </div>
      )}
      {questionText && (
        <div className="mt-4 text-sm">
          <span className="font-semibold">Question:</span>{" "}
          <span className="text-gray-200">{questionText}</span>
        </div>
      )}
      {uploadData && (
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleUploadToPinecone}
            disabled={uploading}
            className={`inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-semibold ${
              uploading
                ? "bg-gray-600 text-gray-300 cursor-not-allowed"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
          >
            {uploading ? "Uploading to Pinecone..." : "Upload answers to Pinecone"}
          </button>
          {uploadStatus && (
            <span className="text-xs text-gray-300">{uploadStatus}</span>
          )}
        </div>
      )}
      {summaries && summaries.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold mb-2">
            Weighted results by segment
          </h3>
          <div className="overflow-auto border border-gray-700 rounded">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-700">
                <tr>
                  <th className="px-2 py-1 text-left border-b border-gray-600">
                    Segment
                  </th>
                  <th className="px-2 py-1 text-right border-b border-gray-600">
                    N (unweighted)
                  </th>
                  <th className="px-2 py-1 text-right border-b border-gray-600">
                    Total weight
                  </th>
                  <th className="px-2 py-1 text-right border-b border-gray-600">
                    Avg. weight
                  </th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((s) => (
                  <tr key={s.segment} className="bg-gray-800">
                    <td className="px-2 py-1 border-b border-gray-700">
                      {s.segment}
                    </td>
                    <td className="px-2 py-1 border-b border-gray-700 text-right">
                      {s.count}
                    </td>
                    <td className="px-2 py-1 border-b border-gray-700 text-right">
                      {s.totalWeight.toFixed(2)}
                    </td>
                    <td className="px-2 py-1 border-b border-gray-700 text-right">
                      {s.averageWeight != null ? s.averageWeight.toFixed(3) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
