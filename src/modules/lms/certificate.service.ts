/**
 * PDF certificate generator.
 *
 * Produces an A4 portrait PDF with the PawMateHub orange header, the
 * provider's name, the course title (EN + AR side by side), the date,
 * and the score. The buffer is then handed to UploadsService.
 * uploadPrivateFile so the asset lives behind a 15-min signed URL just
 * like vaccination passports — readable by the provider and admins
 * only, never world-readable.
 */
import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { UploadsService } from '../uploads/uploads.service';

const PRIMARY_HEX = '#E8632A';
const TEXT_HEX = '#181C1F';
const MUTED_HEX = '#6B5D4F';

interface CertificateInputs {
  providerId: string;
  providerName: string;
  courseId: string;
  courseTitleEn: string;
  courseTitleAr: string;
  score: number;
  issuedAt: Date;
}

@Injectable()
export class CertificateService {
  private readonly logger = new Logger(CertificateService.name);

  constructor(private readonly uploads: UploadsService) {}

  /**
   * Render the certificate to a buffer + upload it to private Cloudinary
   * storage. Returns the storage key — the caller persists this on
   * CourseEnrollment.certificateKey, and the LMS controller mints signed
   * URLs on demand via /lms/courses/:id/certificate.
   */
  async generateCertificate(inputs: CertificateInputs): Promise<string> {
    const buffer = await this.renderPdf(inputs);

    const folder = `pawmatehub/certificates/${inputs.providerId}`;
    const result = await this.uploads.uploadPrivateFile(
      buffer,
      'application/pdf',
      folder,
    );

    this.logger.log(
      `Issued certificate ${result.key} for ${inputs.providerId} on ${inputs.courseId}`,
    );

    return result.key;
  }

  /** Wraps PDFKit's stream-based API in a promise that resolves to a Buffer. */
  private renderPdf(inputs: CertificateInputs): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0 });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;

      // ── Header — orange band with white wordmark ──
      doc.rect(0, 0, pageWidth, 110).fill(PRIMARY_HEX);
      doc
        .fillColor('#FFFFFF')
        .fontSize(32)
        .font('Helvetica-Bold')
        .text('PawMateHub', 0, 38, { align: 'center', width: pageWidth });
      doc
        .fontSize(11)
        .font('Helvetica')
        .fillColor('#FFFFFF')
        .text('Certified Provider Program', 0, 78, {
          align: 'center',
          width: pageWidth,
        });

      // ── Body ──
      doc.fillColor(TEXT_HEX);
      doc
        .fontSize(14)
        .font('Helvetica')
        .text('This certificate is awarded to', 0, 170, {
          align: 'center',
          width: pageWidth,
        });

      doc
        .fontSize(28)
        .font('Helvetica-Bold')
        .fillColor(PRIMARY_HEX)
        .text(inputs.providerName, 60, 210, {
          align: 'center',
          width: pageWidth - 120,
        });

      // Underline rule
      doc
        .moveTo(160, 260)
        .lineTo(pageWidth - 160, 260)
        .lineWidth(1)
        .strokeColor('#E0C0B1')
        .stroke();

      doc
        .fillColor(TEXT_HEX)
        .fontSize(13)
        .font('Helvetica')
        .text('for successfully completing', 0, 280, {
          align: 'center',
          width: pageWidth,
        });

      doc
        .fontSize(20)
        .font('Helvetica-Bold')
        .fillColor(TEXT_HEX)
        .text(inputs.courseTitleEn, 60, 310, {
          align: 'center',
          width: pageWidth - 120,
        });

      // Arabic title — pdfkit's default font lacks Arabic glyphs, so this
      // line renders as the Arabic Unicode codepoints in fallback form
      // when the font doesn't ship glyphs. Display intent: keep both
      // titles on the doc so the bilingual story is preserved even when
      // a custom font has been wired up.
      doc
        .fontSize(16)
        .font('Helvetica')
        .fillColor(MUTED_HEX)
        .text(inputs.courseTitleAr, 60, 340, {
          align: 'center',
          width: pageWidth - 120,
          features: ['rtla'],
        });

      // ── Score + date row ──
      const baselineY = pageHeight - 220;
      const colWidth = (pageWidth - 200) / 2;

      doc
        .fillColor(MUTED_HEX)
        .fontSize(11)
        .font('Helvetica')
        .text('SCORE', 100, baselineY, { width: colWidth, align: 'center' });
      doc
        .fillColor(TEXT_HEX)
        .fontSize(22)
        .font('Helvetica-Bold')
        .text(`${inputs.score}%`, 100, baselineY + 18, {
          width: colWidth,
          align: 'center',
        });

      doc
        .fillColor(MUTED_HEX)
        .fontSize(11)
        .font('Helvetica')
        .text('ISSUED', 100 + colWidth, baselineY, {
          width: colWidth,
          align: 'center',
        });
      doc
        .fillColor(TEXT_HEX)
        .fontSize(18)
        .font('Helvetica-Bold')
        .text(formatDate(inputs.issuedAt), 100 + colWidth, baselineY + 22, {
          width: colWidth,
          align: 'center',
        });

      // ── Footer ──
      doc.rect(0, pageHeight - 60, pageWidth, 60).fill('#F1F4F7');
      doc
        .fillColor(MUTED_HEX)
        .fontSize(10)
        .font('Helvetica')
        .text(
          'PawMateHub Certified Provider Program · pawmatehub.com',
          0,
          pageHeight - 35,
          { align: 'center', width: pageWidth },
        );

      doc.end();
    });
  }
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}
