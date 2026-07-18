import { db } from '../db';

interface SendWhatsAppParams {
  recipientPhone: string;
  studentName: string;
  examTitle: string;
  reportUrl: string;
  accessToken: string;
}

export interface WhatsAppConfig {
  metaAccessToken: string;
  phoneNumberId: string;
  templateName: string;
  templateType: 'body_link' | 'button_link';
}

/**
 * Loads WhatsApp configuration from local database settings.
 */
export async function getWhatsAppConfig(): Promise<WhatsAppConfig> {
  const token = await db.settings.where('key').equals('metaAccessToken').first();
  const phoneId = await db.settings.where('key').equals('phoneNumberId').first();
  const template = await db.settings.where('key').equals('templateName').first();
  const type = await db.settings.where('key').equals('templateType').first();

  return {
    metaAccessToken: token?.value || '',
    phoneNumberId: phoneId?.value || '',
    templateName: template?.value || 'exam_report_notification',
    templateType: (type?.value as any) || 'body_link'
  };
}

/**
 * Sends a pre-approved template message to a parent's WhatsApp number.
 */
export async function sendWhatsAppTemplateMessage(
  params: SendWhatsAppParams,
  config: WhatsAppConfig
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const { recipientPhone, studentName, examTitle, reportUrl, accessToken } = params;
  const { metaAccessToken, phoneNumberId, templateName, templateType } = config;

  if (!metaAccessToken || !phoneNumberId) {
    return { success: false, error: 'WhatsApp API Credentials are not configured. Please fill them in the settings tab.' };
  }

  const cleanPhone = recipientPhone.replace(/[\s\-\(\)\+]/g, '');
  if (!cleanPhone || isNaN(Number(cleanPhone))) {
    return { success: false, error: 'Invalid recipient phone number format.' };
  }

  const isHelloWorld = templateName.toLowerCase() === 'hello_world';
  const endpoint = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;

  // Build the message components list dynamically based on template type
  let components: any[] = [];
  if (!isHelloWorld) {
    if (templateType === 'button_link') {
      components = [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: studentName },
            { type: 'text', text: examTitle }
          ]
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [
            { type: 'text', text: accessToken }
          ]
        }
      ];
    } else {
      // Default: body_link
      components = [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: studentName },
            { type: 'text', text: examTitle },
            { type: 'text', text: reportUrl }
          ]
        }
      ];
    }
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanPhone,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: isHelloWorld ? 'en_US' : 'en'
      },
      components
    }
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${metaAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.error?.message || `HTTP error! Status: ${response.status}`;
      return { success: false, error: errorMsg };
    }

    const messageId = data.messages?.[0]?.id;
    return { success: true, messageId };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network connection failed.' };
  }
}
