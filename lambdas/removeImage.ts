import { SQSHandler } from "aws-lambda";
import { S3Client, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client();
const BUCKET_NAME = process.env.BUCKET_NAME || "";

export const handler: SQSHandler = async (event) => {
  console.log("Event received by RemoveImage Lambda: ", JSON.stringify(event));
  console.log("Target bucket for deletion: ", BUCKET_NAME);
  
  if (!BUCKET_NAME) {
    console.error("BUCKET_NAME environment variable is not set");
    return;
  }
  
  for (const record of event.Records) {
    console.log("Processing DLQ record:", record.messageId);
    try {
      console.log("Raw message body:", record.body);
      
      let recordBody;
      try {
        recordBody = JSON.parse(record.body);
        console.log("Parsed record body:", JSON.stringify(recordBody));
      } catch (parseError) {
        console.error("Error parsing record body:", parseError);
        continue;
      }
      
      if (recordBody.Message) {
        let snsMessage;
        try {
          snsMessage = JSON.parse(recordBody.Message);
          console.log("Parsed SNS message:", JSON.stringify(snsMessage));
        } catch (parseError) {
          console.error("Error parsing SNS message:", parseError);
          continue;
        }
        
        if (snsMessage.Records && Array.isArray(snsMessage.Records)) {
          for (const messageRecord of snsMessage.Records) {
            if (messageRecord.eventSource !== 'aws:s3') {
              console.log("Not an S3 event, skipping:", messageRecord.eventSource);
              continue;
            }
            
            const s3Event = messageRecord.s3;
            if (!s3Event) {
              console.log("Missing s3 info in record, skipping");
              continue;
            }
            
            const srcBucket = s3Event.bucket?.name;
            const srcKey = s3Event.object?.key ? 
              decodeURIComponent(s3Event.object.key.replace(/\+/g, " ")) : 
              null;
            
            if (!srcKey) {
              console.error("Missing object key in S3 event");
              continue;
            }
            
            console.log(`Attempting to remove invalid file: s3://${BUCKET_NAME}/${srcKey}`);
            
            try {
              await s3Client.send(new HeadObjectCommand({
                Bucket: BUCKET_NAME,
                Key: srcKey,
              }));

              try {
                await s3Client.send(new DeleteObjectCommand({
                  Bucket: BUCKET_NAME,
                  Key: srcKey,
                }));
                console.log(`Successfully deleted invalid file: ${srcKey} from bucket ${BUCKET_NAME}`);
              } catch (deleteError) {
                console.error(`Error deleting file ${srcKey}:`, deleteError);
              }
            } catch (headError) {
              console.error(`File ${srcKey} not found in bucket ${BUCKET_NAME}:`, headError);
            }
          }
        } else {
          console.log("No valid Records field in SNS message or not an array");
        }
      } else {
        console.log("Message in DLQ doesn't have Message field, skipping");
      }
    } catch (error) {
      console.error("Error processing DLQ message:", error);
    }
  }
};