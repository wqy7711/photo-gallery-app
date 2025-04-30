import { DynamoDBStreamEvent } from "aws-lambda";
import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from "../env";
import {
  SESClient,
  SendEmailCommand,
  SendEmailCommandInput,
} from "@aws-sdk/client-ses";

if (!SES_EMAIL_TO || !SES_EMAIL_FROM || !SES_REGION) {
  throw new Error(
    "Please add the SES_EMAIL_TO, SES_EMAIL_FROM and SES_REGION environment variables in an env.js file located in the root directory"
  );
}

type ContactDetails = {
  name: string;
  email: string;
  message: string;
};

const client = new SESClient({ region: SES_REGION });

export const handler = async (event: DynamoDBStreamEvent) => {
  console.log("Event: ", JSON.stringify(event));
  
  for (const record of event.Records) {
    try {
      if (record.eventName !== "MODIFY" && record.eventName !== "INSERT") {
        console.log(`Skipping event type: ${record.eventName}`);
        continue;
      }
      
      if (!record.dynamodb || !record.dynamodb.NewImage) {
        console.log("Record missing dynamodb.NewImage data");
        continue;
      }
      
      const newImage = record.dynamodb.NewImage;
      const oldImage = record.dynamodb.OldImage;
      
      const newStatus = newImage.status?.S;
      const oldStatus = oldImage?.status?.S;
      
      const isStatusChange = 
        (record.eventName === "INSERT" && newStatus) ||
        (record.eventName === "MODIFY" && oldStatus !== newStatus);
      
      if (!isStatusChange) {
        console.log("No status change detected, skipping notification");
        continue;
      }
      
      console.log(`Status change detected: ${oldStatus || 'None'} -> ${newStatus}`);
      
      const imageId = newImage.id?.S || "unknown";
      const statusReason = newImage.statusReason?.S || "No reason provided";
      
      const message = `The status of image "${imageId}" has been updated to "${newStatus}". Reason: ${statusReason}`;
      
      try {
        const contactDetails: ContactDetails = {
          name: "Photo Gallery System",
          email: SES_EMAIL_FROM,
          message: message,
        };
        const params = sendEmailParams(contactDetails);
        await client.send(new SendEmailCommand(params));
        console.log(`Successfully sent status update email to ${SES_EMAIL_TO}`);
      } catch (emailError) {
        console.error("Error sending email:", emailError);
      }
      
    } catch (error) {
      console.error("Error processing record:", error);
    }
  }
};

function sendEmailParams({ name, email, message }: ContactDetails) {
  const parameters: SendEmailCommandInput = {
    Destination: {
      ToAddresses: [SES_EMAIL_TO],
    },
    Message: {
      Body: {
        Html: {
          Charset: "UTF-8",
          Data: getHtmlContent({ name, email, message }),
        },
      },
      Subject: {
        Charset: "UTF-8",
        Data: `Photo Status Update`,
      },
    },
    Source: SES_EMAIL_FROM,
  };
  return parameters;
}

function getHtmlContent({ name, email, message }: ContactDetails) {
  return `
    <html>
      <body>
        <h2>Status Update Notification</h2>
        <ul>
          <li style="font-size:18px">👤 <b>${name}</b></li>
          <li style="font-size:18px">✉️ <b>${email}</b></li>
        </ul>
        <p style="font-size:18px">${message}</p>
      </body>
    </html> 
  `;
}