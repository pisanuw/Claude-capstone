export const SAMPLE_PROMPT = `System: You are a helpful coding assistant. Please make sure to always respond in valid JSON. In order to succeed at this task, please be very careful and please be kind to the user.

Context: The user is a beginner Python programmer working through their first data structures course. Please make sure to always respond in valid JSON.

Examples:
Example 1: Input: "What is a list?" Output: {"answer": "An ordered, mutable collection."}
Example 2: Input: "What is a tuple?" Output: {"answer": "An ordered, immutable collection."}
Example 3: Input: "What is a set?" Output: {"answer": "An unordered collection of unique items."}
Example 4: Input: "What is a dict?" Output: {"answer": "A collection of key-value pairs."}

User: I think the code below is sort of broken, due to the fact that it throws an error. Can you take a look at this?

\`\`\`python
def add(a, b):
    return a + b.strip()
\`\`\`
`;
