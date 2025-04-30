import { SQSHandler } from "aws-lambda";
import {
  DynamoDBClient,
  UpdateItemCommand,
  GetItemCommand,
  ReturnValue,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";

const dynamoClient = new DynamoDBClient();
const TABLE_NAME = process.env.TABLE_NAME || "";

export const handler: SQSHandler = async (event) => {
  console.log("Event: ", JSON.stringify(event));
  
  if (!TABLE_NAME) {
    console.error("TABLE_NAME environment variable is not set");
    throw new Error("Configuration error: TABLE_NAME is not set");
  }
  
  for (const record of event.Records) {
    try {
      console.log("Processing record:", record.messageId);
      
      const recordBody = JSON.parse(record.body);
      console.log("Record body:", JSON.stringify(recordBody));
      
      const message = recordBody.Message ? JSON.parse(recordBody.Message) : null;
      
      if (!message) {
        console.error("Message is missing or invalid");
        continue;
      }
      
      console.log("Status update message:", JSON.stringify(message));
      
      const { id, date, update } = message;
      
      if (!id || !update || !update.status) {
        console.error("Invalid message format: Missing required fields (id, date, or update.status)");
        continue;
      }
      
      if (!isValidStatus(update.status)) {
        console.error(`Invalid status: ${update.status}. Only Pass or Reject are allowed.`);
        continue;
      }
      
      const getParams = {
        TableName: TABLE_NAME,
        Key: marshall({ id }),
      };
      
      console.log(`Checking if image ${id} exists in database`);
      const { Item } = await dynamoClient.send(new GetItemCommand(getParams));
      
      if (!Item) {
        console.error(`Image with id ${id} not found in the database`);
        continue;
      }
      
      console.log(`Updating status for image ${id} to ${update.status} with reason: ${update.reason || "None provided"}`);
      
      const updateParams = {
        TableName: TABLE_NAME,
        Key: marshall({ id }),
        UpdateExpression: "SET #status = :status, statusReason = :reason, statusDate = :date, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#status": "status",
        },
        ExpressionAttributeValues: marshall({
          ":status": update.status,
          ":reason": update.reason || "",
          ":date": date || new Date().toISOString(),
          ":updatedAt": new Date().toISOString(),
        }),
        ReturnValues: ReturnValue.ALL_NEW,
      };
      
      const updateResult = await dynamoClient.send(new UpdateItemCommand(updateParams));
      console.log(`Successfully updated status for image ${id} to ${update.status}`);
      
      if (updateResult.Attributes) {
        const updatedItem = unmarshall(updateResult.Attributes);
        console.log("Updated item:", JSON.stringify(updatedItem));
      }
      
    } catch (error) {
      console.error("Error processing status update:", error);
    }
  }
};

function isValidStatus(status: string): boolean {
  const validStatuses = ["Pass", "Reject"];
  return validStatuses.includes(status);
}