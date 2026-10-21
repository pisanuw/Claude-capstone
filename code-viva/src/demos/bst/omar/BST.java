import java.util.ArrayList;
import java.util.List;

public class BST {
    private static class Node {
        int key;
        Node left, right;
        Node(int key) { this.key = key; }
    }

    private Node root;

    public void insert(int key) {
        root = insert(root, key);
    }

    private Node insert(Node node, int key) {
        if (node == null) {
            return new Node(key);
        }
        if (key < node.key) {
            node.left = insert(node.left, key);
        } else if (key > node.key) {
            node.right = insert(node.right, key);
        }
        return node;
    }

    public boolean contains(int key) {
        Node current = root;
        while (current != null) {
            if (key == current.key) {
                return true;
            }
            current = key < current.key ? current.left : current.right;
        }
        return false;
    }

    public int height() {
        return heightOf(root);
    }

    private int heightOf(Node node) {
        if (node == null) {
            return -1;
        }
        return 1 + Math.max(heightOf(node.left), heightOf(node.right));
    }

    public List<Integer> inOrder() {
        List<Integer> keys = new ArrayList<>();
        walk(root, keys);
        return keys;
    }

    private void walk(Node node, List<Integer> keys) {
        if (node == null) {
            return;
        }
        walk(node.left, keys);
        keys.add(node.key);
        walk(node.right, keys);
    }
}
