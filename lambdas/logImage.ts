import { SQSHandler } from "aws-lambda";
import {
  DynamoDBClient,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const dynamoClient = new DynamoDBClient();
const TABLE_NAME = process.env.TABLE_NAME || "";

export const handler: SQSHandler = async (event) => {
  console.log("Event received by LogImage Lambda: ", JSON.stringify(event));
  
  for (const record of event.Records) {
    try {
      console.log("Processing record:", record.messageId);
      const recordBody = JSON.parse(record.body);
      
      console.log("Record body:", JSON.stringify(recordBody));
      
      if (!recordBody.Message) {
        console.error("Missing Message field in record body");
        throw new Error("Invalid message format: Missing Message field");
      }
      
      const snsMessage = JSON.parse(recordBody.Message);
      console.log("SNS Message:", JSON.stringify(snsMessage));
      
      if (snsMessage.Records) {
        for (const messageRecord of snsMessage.Records) {
          if (messageRecord.eventSource !== 'aws:s3') {
            console.log("Not an S3 event, skipping");
            continue;
          }
          
          const s3Event = messageRecord.s3;
          const srcBucket = s3Event.bucket.name;
          const srcKey = decodeURIComponent(s3Event.object.key.replace(/\+/g, " "));
          
          console.log(`Processing S3 object: s3://${srcBucket}/${srcKey}`);
          
          if (!isValidImageType(srcKey)) {
            console.error(`Invalid image type: ${srcKey}. Only .jpeg, .jpg and .png are allowed.`);
            throw new Error(`Invalid image type: ${srcKey}. Only .jpeg, .jpg and .png are allowed.`);
          }
          
          try {
            const params = {
              TableName: TABLE_NAME,
              Item: marshall({
                id: srcKey,
                uploadTime: new Date().toISOString(),
                bucket: srcBucket,
                createdAt: new Date().toISOString(),
              }),
            };
            
            await dynamoClient.send(new PutItemCommand(params));
            console.log(`Successfully logged image: ${srcKey} to DynamoDB table: ${TABLE_NAME}`);
          } catch (error) {
            console.error("Error saving to DynamoDB:", error);
            throw error;
          }
        }
      } else {
        console.log("No Records field in SNS message, skipping");
      }
    } catch (error) {
      console.error("Error processing record:", error);
      throw error;
    }
  }
};

function isValidImageType(filename: string): boolean {
  console.log(`Checking if ${filename} is a valid image type`);
  const lowerCaseFilename = filename.toLowerCase();
  const result = lowerCaseFilename.endsWith('.jpeg') || 
         lowerCaseFilename.endsWith('.jpg') || 
         lowerCaseFilename.endsWith('.png');
  
  console.log(`File ${filename} is ${result ? 'valid' : 'invalid'}`);
  return result;
}