#!/usr/bin/env bun
import { parseArgs } from 'node:util';
import { stripPrefixes } from './shared/XML-parser';
import { xml2js } from 'xml-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, basename } from 'path';
import type { Faktura as Faktura1 } from './lib-public/types/fa1.types';
import type { Faktura as Faktura2 } from './lib-public/types/fa2.types';
import type { Faktura as Faktura3 } from './lib-public/types/fa3.types';
import type { Upo } from './lib-public/types/upo-v4_2.types';
import type { AdditionalDataTypes } from './lib-public/types/common.types';

const HELP_TEXT = `
KSeF PDF Generator - CLI

Usage:
  ksef-pdf <input.xml> [options]

Options:
  -o, --output <path>    Output PDF file path (default: input.pdf)
  -t, --type <type>      Document type: invoice or upo (default: auto-detect)
  -k, --ksef <nr>        KSeF invoice number (optional)
  -q, --qrcode <data>    QR code data (optional)
  -j, --json             Output result as JSON
  -h, --help             Show help

Examples:
  ksef-pdf invoice.xml
  ksef-pdf invoice.xml -o output.pdf
  ksef-pdf invoice.xml -k "1234567890-20240101-ABCD1234-EF"
  ksef-pdf invoice.xml --qrcode "<qr_code_link>"
  ksef-pdf upo.xml -t upo -o upo_output.pdf
  ksef-pdf invoice.xml --json
`;

const CLI_OPTIONS = {
  output: { type: 'string' as const, short: 'o' },
  type: { type: 'string' as const, short: 't' },
  ksef: { type: 'string' as const, short: 'k' },
  qrcode: { type: 'string' as const, short: 'q' },
  json: { type: 'boolean' as const, short: 'j' },
  help: { type: 'boolean' as const, short: 'h' },
} as const;

type DocumentType = 'invoice' | 'upo';
type InvoiceVersion = 'FA (1)' | 'FA (2)' | 'FA (3)';
type InvoiceFaktura = Faktura1 | Faktura2 | Faktura3;

interface ParsedXml {
  Faktura?: InvoiceFaktura;
  Potwierdzenie?: Upo['Potwierdzenie'];
}

interface SuccessResult {
  success: true;
  input: string;
  output: string;
  type: DocumentType;
  size: number;
}

interface ErrorResult {
  success: false;
  error: string;
  input?: string;
}

type CliResult = SuccessResult | ErrorResult;

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: CLI_OPTIONS,
  allowPositionals: true,
});

const isJsonMode = values.json || false;

function log(message: string): void {
  if (isJsonMode) return;
  console.log(message);
}

function logError(message: string): void {
  if (isJsonMode) return;
  console.error(`Error: ${message}`);
}

function outputJson(result: CliResult): void {
  console.log(JSON.stringify(result, null, 0));
}

if (values.help || positionals.length === 0) {
  console.log(HELP_TEXT);
  process.exit(0);
}

function detectDocumentType(xml: ParsedXml): DocumentType {
  if ('Faktura' in xml) return 'invoice';
  if ('Potwierdzenie' in xml) return 'upo';
  throw new Error('Unable to detect document type. Use -t invoice or -t upo');
}

function validateDocumentType(type: string | undefined): asserts type is DocumentType | undefined {
  if (!type) return;
  if (type !== 'invoice' && type !== 'upo') {
    throw new Error(`Invalid document type: ${type}. Must be 'invoice' or 'upo'`);
  }
}

async function generatePDFByVersion(
  version: InvoiceVersion,
  faktura: InvoiceFaktura,
  additionalData: AdditionalDataTypes
) {
  switch (version) {
    case 'FA (1)': {
      const { generateFA1 } = await import('./lib-public/FA1-generator');
      return generateFA1(faktura as Faktura1, additionalData);
    }
    case 'FA (2)': {
      const { generateFA2 } = await import('./lib-public/FA2-generator');
      return generateFA2(faktura as Faktura2, additionalData);
    }
    case 'FA (3)': {
      const { generateFA3 } = await import('./lib-public/FA3-generator');
      return generateFA3(faktura as Faktura3, additionalData);
    }
  }
}

async function generateInvoicePDF(
  xml: ParsedXml,
  nrKSeF?: string,
  qrCode?: string
): Promise<Blob> {
  if (!xml.Faktura) {
    throw new Error('Invalid invoice XML: missing Faktura element');
  }

  const version = xml.Faktura.Naglowek?.KodFormularza?._attributes?.kodSystemowy as
    | InvoiceVersion
    | undefined;

  if (!version) {
    throw new Error('Invalid invoice XML: missing version information');
  }

  const additionalData: AdditionalDataTypes = {
    nrKSeF: nrKSeF || 'CLI-GENERATED',
    qrCode,
  };

  const pdf = await generatePDFByVersion(version, xml.Faktura, additionalData);

  return new Promise<Blob>((resolve, reject) => {
    pdf.getBlob((blob: Blob) => {
      if (!blob) {
        reject(new Error('Failed to generate PDF blob'));
        return;
      }
      resolve(blob);
    });
  });
}

async function generateUPOPDF(xml: ParsedXml): Promise<Blob> {
  const { generatePDFUPOFromParsed } = await import('./lib-public/UPO-4_2-generators');
  const upo: Upo = { Potwierdzenie: xml.Potwierdzenie };
  return generatePDFUPOFromParsed(upo);
}

function getOutputPath(inputPath: string, outputArg?: string): string {
  if (outputArg) return outputArg;

  const hasXmlExt = inputPath.toLowerCase().endsWith('.xml');
  return hasXmlExt ? inputPath.slice(0, -4) + '.pdf' : inputPath + '.pdf';
}

function parseXmlContent(xmlContent: string): ParsedXml {
  try {
    return stripPrefixes(xml2js(xmlContent, { compact: true })) as ParsedXml;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to parse XML: ${message}`);
  }
}

async function processFile(inputPath: string): Promise<SuccessResult> {
  const inputFile = basename(inputPath);

  if (!existsSync(inputPath)) {
    throw new Error(`File not found: ${inputFile}`);
  }

  log(`Loading: ${inputFile}`);

  const xmlContent = readFileSync(inputPath, 'utf-8');
  if (!xmlContent.trim()) {
    throw new Error('XML file is empty');
  }

  const parsedXml = parseXmlContent(xmlContent);

  validateDocumentType(values.type);
  const docType = (values.type as DocumentType | undefined) || detectDocumentType(parsedXml);
  log(`Type: ${docType === 'invoice' ? 'Invoice' : 'UPO'}`);

  log('Generating PDF...');

  const pdfBlob =
    docType === 'invoice'
      ? await generateInvoicePDF(parsedXml, values.ksef, values.qrcode)
      : await generateUPOPDF(parsedXml);

  const outputPath = getOutputPath(inputPath, values.output);
  const arrayBuffer = await pdfBlob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  writeFileSync(outputPath, buffer);

  return {
    success: true,
    input: inputFile,
    output: basename(outputPath),
    type: docType,
    size: buffer.length,
  };
}

async function main() {
  let inputPath: string | undefined;

  try {
    inputPath = resolve(positionals[0]);
    const result = await processFile(inputPath);

    if (values.json) {
      outputJson(result);
      return;
    }

    log(`PDF saved: ${result.output}`);
    log(`Size: ${(result.size / 1024).toFixed(2)} KB`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorResult: ErrorResult = {
      success: false,
      error: errorMessage,
      input: inputPath ? basename(inputPath) : undefined,
    };

    if (values.json) {
      outputJson(errorResult);
    } else {
      logError(errorMessage);
    }

    process.exit(1);
  }
}

main();
