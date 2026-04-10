'use client';

import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Bot, Send, Upload, FileText, Sparkles,
  RefreshCw, AlertCircle, ChevronRight, CheckCircle2,
} from 'lucide-react';
import {
  aiApi,
  QUICK_QUESTIONS,
  type ChatMessage,
  type DocumentAnalysisResponse,
} from '@/services/ai-assistant';
import { useI18n } from '@/hooks/use-i18n';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

/* ─── Chat Balonu ─────────────────────────────────────────────── */

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div className={cn("flex w-full mb-4", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <Avatar className="size-8 mr-2 mt-1 border border-border shadow-sm">
          <AvatarImage src="" />
          <AvatarFallback className="bg-muted text-muted-foreground">
            <Bot size={16} />
          </AvatarFallback>
        </Avatar>
      )}
      <div
        className={cn(
          "max-w-[80%] px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap shadow-sm border",
          isUser
            ? "bg-primary/10 border-primary/20 text-foreground rounded-tr-none"
            : "bg-muted border-border text-foreground rounded-tl-none"
        )}
      >
        {msg.content}
      </div>
    </div>
  );
}

/* ─── Hızlı Soru Butonu ────────────────────────────────────────── */

function QuickQuestion({ text, onClick }: { text: string; onClick: () => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="h-8 rounded-full text-[11px] gap-1.5"
    >
      <ChevronRight size={10} className="opacity-40" />
      {text}
    </Button>
  );
}

/* ─── Belge Analiz Sonucu ─────────────────────────────────────── */

function DocumentResult({ result }: { result: DocumentAnalysisResponse }) {
  const { t } = useI18n();
  return (
    <Card className="mt-6 shadow-sm overflow-hidden">
      <CardHeader className="px-6 py-4 border-b border-border flex flex-row items-center justify-between space-y-0 bg-muted/20">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <FileText size={14} />
          </div>
          <CardTitle className="text-sm font-semibold">{t("ai.asistan.documentAnalysisResult")}</CardTitle>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] uppercase px-2 h-5 shadow-none",
            result.confidence > 0.8
              ? "bg-primary/10 border-primary/20 text-primary"
              : "bg-muted text-muted-foreground"
          )}
        >
          {t("ai.asistan.confidence")}: %{Math.round(result.confidence * 100)}
        </Badge>
      </CardHeader>

      <CardContent className="p-6 flex flex-col gap-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { label: t("ai.asistan.invoiceNo"),     value: result.invoice_number },
            { label: t("ai.asistan.invoiceDate"), value: result.invoice_date   },
            { label: t("ai.asistan.supplier"),     value: result.vendor_name    },
            { label: t("ai.asistan.vkn"),           value: result.vendor_vkn     },
            { label: t("ai.asistan.totalAmount"),  value: result.total_amount != null ? `${result.total_amount.toLocaleString('tr-TR')} ${result.currency ?? '₺'}` : undefined },
            { label: t("ai.asistan.vatAmount"),    value: result.vat_amount != null ? `${result.vat_amount.toLocaleString('tr-TR')} ${result.currency ?? '₺'}` : undefined },
          ].map(({ label, value }) => value && (
            <div key={label} className="bg-muted/30 rounded-lg p-3 border border-border">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">{label}</p>
              <p className="text-sm font-medium text-foreground">{value}</p>
            </div>
          ))}
        </div>

        {result.line_items && result.line_items.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{t("ai.asistan.lineItems")}</p>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-[9px] uppercase tracking-wider h-8 px-4 text-muted-foreground">{t("ai.asistan.description")}</TableHead>
                    <TableHead className="text-[9px] uppercase tracking-wider h-8 px-4 text-muted-foreground text-right">{t("ai.asistan.quantity")}</TableHead>
                    <TableHead className="text-[9px] uppercase tracking-wider h-8 px-4 text-muted-foreground text-right">{t("ai.asistan.unitPrice")}</TableHead>
                    <TableHead className="text-[9px] uppercase tracking-wider h-8 px-4 text-muted-foreground text-right">{t("ai.asistan.vatRate")}</TableHead>
                    <TableHead className="text-[9px] uppercase tracking-wider h-8 px-4 text-muted-foreground text-right">{t("ai.asistan.total")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.line_items.map((li, i) => (
                    <TableRow key={i} className="hover:bg-muted/50">
                      <TableCell className="px-4 py-2 text-xs text-foreground">{li.description}</TableCell>
                      <TableCell className="px-4 py-2 text-right">
                        <span className="text-[11px] text-muted-foreground tabular-nums">{li.quantity}</span>
                      </TableCell>
                      <TableCell className="px-4 py-2 text-right">
                        <span className="text-[11px] text-muted-foreground tabular-nums">{li.unit_price.toLocaleString('tr-TR')}</span>
                      </TableCell>
                      <TableCell className="px-4 py-2 text-right">
                        <span className="text-[11px] text-muted-foreground tabular-nums">%{li.vat_rate}</span>
                      </TableCell>
                      <TableCell className="px-4 py-2 text-right">
                        <span className="text-xs font-medium text-foreground tabular-nums">{li.total.toLocaleString('tr-TR')}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Ana Sayfa ───────────────────────────────────────────────── */

export default function AiAsistanPage() {
  const { t } = useI18n();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'document'>('chat');
  const [docResult, setDocResult] = useState<DocumentAnalysisResponse | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const chatMut = useMutation({
    mutationFn: (msg: string) => aiApi.chat({
      message: msg,
      history: messages.slice(-10),
    }),
    onSuccess: (res, msg) => {
      setMessages(prev => [
        ...prev,
        { role: 'user',      content: msg },
        { role: 'assistant', content: res.data.reply },
      ]);
      setInput('');
    },
    onError: () => {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: t("ai.asistan.error") },
      ]);
    },
  });

  const docMut = useMutation({
    mutationFn: (file: File) => aiApi.analyzeDocument(file),
    onSuccess: (res) => { setDocResult(res.data); setDocError(null); },
    onError: () => setDocError(t("ai.asistan.documentError")),
  });

  const sendMsg = () => {
    const msg = input.trim();
    if (!msg || chatMut.isPending) return;
    chatMut.mutate(msg);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocFile(file);
    setDocResult(null);
    setDocError(null);
    docMut.mutate(file);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] gap-6">
      {/* Başlık */}
      <div className="flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
            <Bot size={18} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("ai.asistan.title")}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("ai.asistan.subtitle")}
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0" onValueChange={(v) => setActiveTab(v as 'chat' | 'document')}>
        <TabsList className="w-fit mb-4 flex-shrink-0">
          <TabsTrigger value="chat" className="gap-2">
            <Bot size={14} /> {t("ai.chat")}
          </TabsTrigger>
          <TabsTrigger value="document" className="gap-2">
            <FileText size={14} /> {t("ai.asistan.documentAnalysis")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="flex-1 flex flex-col min-h-0 m-0">
          <ScrollArea className="flex-1 pr-4 mb-4">
            {messages.length === 0 ? (
              <div className="h-[400px] flex flex-col items-center justify-center text-center px-4">
                <div className="p-5 rounded-full bg-muted flex items-center justify-center mb-6">
                  <Sparkles size={32} className="text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">{t("ai.asistan.greetingTitle")}</h3>
                <p className="text-sm text-muted-foreground max-w-[420px] leading-relaxed mb-10">
                  {t("ai.asistan.greetingDescription")}
                </p>
                <div className="flex flex-wrap gap-2 justify-center max-w-[600px]">
                  {QUICK_QUESTIONS.map(q => (
                    <QuickQuestion key={q} text={q} onClick={() => { setInput(q); chatMut.mutate(q); }} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="max-w-[800px] mx-auto w-full px-2 flex flex-col gap-2">
                {messages.map((m, i) => <ChatBubble key={i} msg={m} />)}
                {chatMut.isPending && (
                  <div className="flex w-full justify-start mb-4">
                    <Avatar className="size-8 mr-2 mt-1 border border-border shadow-sm">
                      <AvatarFallback className="bg-muted text-muted-foreground animate-pulse">
                        <Bot size={16} />
                      </AvatarFallback>
                    </Avatar>
                    <div className="bg-muted border border-border text-foreground px-4 py-2.5 rounded-2xl rounded-tl-none text-[13px] flex items-center gap-2">
                      <span className="text-muted-foreground text-xs">{t("ai.asistan.preparingAnswer")}</span>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </ScrollArea>

          <footer className="flex flex-col gap-3 flex-shrink-0 max-w-[800px] mx-auto w-full px-2 pb-2">
            {messages.length > 0 && (
              <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
                {QUICK_QUESTIONS.slice(0, 4).map(q => (
                  <QuickQuestion key={q} text={q} onClick={() => { setInput(q); chatMut.mutate(q); }} />
                ))}
              </div>
            )}

            <div className="flex gap-2 p-1.5 rounded-xl bg-muted/30 border border-border shadow-sm">
              <Input
                className="flex-1 bg-transparent border-none shadow-none focus-visible:ring-0 text-sm h-11 px-4"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }}
                placeholder={t("ai.asistan.inputPlaceholder")}
                disabled={chatMut.isPending}
              />
              <Button
                onClick={sendMsg}
                disabled={!input.trim() || chatMut.isPending}
                isLoading={chatMut.isPending}
                size="icon"
                className="size-11 rounded-lg shrink-0"
              >
                {!chatMut.isPending && <Send size={16} />}
              </Button>
            </div>
          </footer>
        </TabsContent>

        <TabsContent value="document" className="flex-1 min-h-0 m-0">
          <ScrollArea className="h-full">
            <div className="max-w-[700px] mx-auto w-full px-2 pb-10">
              <Card className="shadow-sm overflow-hidden">
                  <CardHeader className="bg-muted/20 border-b border-border">
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                        <FileText size={16} />
                      </div>
                      <div>
                        <CardTitle className="text-base font-semibold">{t("ai.asistan.invoiceDocumentAnalysis")}</CardTitle>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{t("ai.asistan.ocrDescription")}</p>
                      </div>
                    </div>
                  </CardHeader>
                <CardContent className="p-8">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "group relative flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-12 transition-colors cursor-pointer",
                      docMut.isPending
                        ? "bg-muted/30 border-border"
                        : "bg-muted/10 border-border hover:border-primary/30 hover:bg-muted/20"
                    )}
                  >
                    {docMut.isPending ? (
                      <div className="flex flex-col items-center text-center">
                        <div className="p-4 rounded-full bg-muted mb-4 animate-pulse">
                          <FileText size={28} className="text-muted-foreground" />
                        </div>
                        <h4 className="text-sm font-medium text-foreground mb-1">{t("ai.asistan.fileReading")}</h4>
                        <p className="text-xs text-muted-foreground">{t("ai.asistan.pleaseWait")}</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-center">
                        <div className="p-4 rounded-xl bg-muted flex items-center justify-center mb-5 text-muted-foreground">
                          <Upload size={28} strokeWidth={1.5} />
                        </div>
                        <h4 className="text-sm font-medium text-foreground mb-2">
                          {docFile ? docFile.name : t("ai.asistan.dragDocumentHere")}
                        </h4>
                        <p className="text-xs text-muted-foreground max-w-[280px] leading-relaxed">
                          {t("ai.asistan.uploadForInvoice")}
                        </p>
                        <div className="mt-5 flex gap-3 text-[10px] text-muted-foreground uppercase tracking-wider">
                          <span className="flex items-center gap-1"><CheckCircle2 size={10} /> {t("ai.asistan.fileTypes.pdf")}</span>
                          <span className="flex items-center gap-1"><CheckCircle2 size={10} /> {t("ai.asistan.fileTypes.jpg")}</span>
                          <span className="flex items-center gap-1"><CheckCircle2 size={10} /> {t("ai.asistan.fileTypes.png")}</span>
                          <span className="flex items-center gap-1"><CheckCircle2 size={10} /> {t("ai.asistan.fileTypes.maxSize")}</span>
                        </div>
                      </div>
                    )}
                    <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFile} className="hidden" />
                  </div>

                  {docFile && !docMut.isPending && (
                    <div className="flex justify-center mt-5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setDocFile(null); setDocResult(null); setDocError(null); }}
                        className="text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 gap-2"
                      >
                        <RefreshCw size={12} />
                        {t("ai.asistan.clearDocument")}
                      </Button>
                    </div>
                  )}

                  {docError && (
                    <Alert variant="destructive" className="mt-6">
                      <AlertCircle size={16} />
                      <AlertDescription>{docError}</AlertDescription>
                    </Alert>
                  )}

                  {docResult && <DocumentResult result={docResult} />}
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
