import { SQSHandler } from "aws-lambda";
import {
  DynamoDBClient,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";

const dynamoClient = new DynamoDBClient();
const TABLE_NAME = process.env.TABLE_NAME || "";

export const handler: SQSHandler = async (event) => {
  console.log("Event: ", JSON.stringify(event));
  
  for (const record of event.Records) {
    try {
      const recordBody = JSON.parse(record.body);
      const snsMessage = JSON.parse(recordBody.Message);
      
      if (snsMessage.Records) {
        for (const messageRecord of snsMessage.Records) {
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
            console.log(`Successfully logged image: ${srcKey} to DynamoDB`);
          } catch (error) {
            console.error("Error saving to DynamoDB:", error);
            throw error;
          }
        }
      }
    } catch (error) {
      console.error("Error processing record:", error);
      throw error;
    }
  }
};

function isValidImageType(filename: string): boolean {
  const lowerCaseFilename = filename.toLowerCase();
  return lowerCaseFilename.endsWith('.jpeg') || 
         lowerCaseFilename.endsWith('.jpg') || 
         lowerCaseFilename.endsWith('.png');
}