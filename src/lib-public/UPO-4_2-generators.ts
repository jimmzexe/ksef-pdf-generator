import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { Upo } from './types/upo-v4_2.types';
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import { generateStyle } from '../shared/PDF-functions';
import { generateNaglowekUPO } from './generators/UPO4_2/Naglowek';
import { generateDokumnetUPO } from './generators/UPO4_2/Dokumenty';
import { parseXML } from '../shared/XML-parser';
import { Position } from '../shared/enums/common.enum';

pdfMake.vfs = pdfFonts.vfs;

export async function generatePDFUPO(file: File): Promise<Blob> {
  const upo = (await parseXML(file)) as Upo;
  return generatePDFUPOFromParsed(upo);
}

export function generatePDFUPOFromParsed(upo: Upo): Promise<Blob> {
  const docDefinition: TDocumentDefinitions = {
    content: [generateNaglowekUPO(upo.Potwierdzenie!), generateDokumnetUPO(upo.Potwierdzenie!)],
    ...generateStyle(),
    pageSize: 'A4',
    pageOrientation: 'landscape',
    footer: function (currentPage: number, pageCount: number) {
      return {
        text: currentPage.toString() + ' z ' + pageCount,
        alignment: Position.RIGHT,
        margin: [0, 0, 20, 0],
      };
    },
  };

  return new Promise((resolve, reject): void => {
    pdfMake.createPdf(docDefinition).getBlob((blob: Blob): void => {
      if (blob) {
        resolve(blob);
      } else {
        reject('Error');
      }
    });
  });
}
